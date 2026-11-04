
 Per testare lo Stage 2 ti serve il broker Mosquitto attivo sul Pi e il programma compilato. Tutto gira sul Pi.

**1. Verifica il broker**
```bash
ss -tlnp | grep mosquitto
# attese due righe LISTEN: :1883 e :9001
```

**2. Compila e avvia**
```bash
cd ~/Lab4/PartOne/device
mkdir -p build && cd build && cmake .. && make
sudo ./main
```
Log di avvio atteso:
```
MQTT connected
STATUS status=online
SERVICES published (8)
```

**3. Apri un monitor su un altro terminale**
```bash
mosquitto_sub -h localhost -t 'vss/boar/#' -v
```
Dovresti vedere subito `vss/boar/services` (è retained) con gli 8 vettori, e `vss/boar/status` con `online`.

**4. Chiama i servizi uno per uno**
```bash
P() { mosquitto_pub -h localhost -t vss/boar/call -m "$1"; }

P '{"id":1,"service":"Calibrate_Sensor","inputs":[]}'
P '{"id":2,"service":"Read_Temp","inputs":[0]}'      # Celsius
P '{"id":3,"service":"Read_Temp","inputs":[1]}'      # Fahrenheit
P '{"id":4,"service":"Read_Humidity","inputs":[]}'
P '{"id":5,"service":"Fan_On","inputs":[50]}'        # l'elica deve girare
P '{"id":6,"service":"Fan_Off","inputs":[]}'
P '{"id":7,"service":"Set_Window","inputs":[120]}'   # il servo deve muoversi
P '{"id":8,"service":"Read_Window_Position","inputs":[]}'
P '{"id":9,"service":"Window_Close","inputs":[]}'
```

Controlli: la temperatura in °C deve essere plausibile, quella in °F coerente (`C*9/5+32`), l'umidità tra 0 e 100. Verifica **fisicamente** che l'elica giri e che il servo si muova — il reply dice solo cosa è stato comandato, non cosa è successo davvero.

**5. Il readback della posizione**
```bash
P '{"id":10,"service":"Set_Window","inputs":[120]}'
P '{"id":11,"service":"Read_Window_Position","inputs":[]}'   # deve tornare 120
cat /tmp/window_angle                                        # deve dire 120

P '{"id":12,"service":"Set_Window","inputs":[999]}'          # clamp a 180
P '{"id":13,"service":"Read_Window_Position","inputs":[]}'   # deve tornare 180

P '{"id":14,"service":"Window_Close","inputs":[]}'
P '{"id":15,"service":"Read_Window_Position","inputs":[]}'   # deve tornare 0

sudo rm /tmp/window_angle
P '{"id":16,"service":"Read_Window_Position","inputs":[]}'   # deve tornare 0, non fallire
```

**6. I casi di errore**
```bash
P '{"id":20,"service":"Non_Esiste","inputs":[]}'    # "Unknown Service"
P '{"id":21,"service":"Read_Temp","inputs":[]}'     # "Incorrect service arguments"
P '{"id":22,"service":"Fan_Off","inputs":[1]}'      # "Incorrect service arguments"
P '{"id":23,"service":"Read_Temp","inputs":[0,1]}'  # "Incorrect service arguments"
```
Tutti devono rispondere con `"status":"Unsuccessful"` e la `description` giusta, senza far crashare il programma.

**7. Chiusura pulita**
`Ctrl-C` deve pubblicare `status=offline`, poi azzerare i due canali PWM e rilasciare i pin.

Una nota: la logica di dispatch, il clamping e la forma delle reply li ho già verificati qui sul laptop con un harness che stubba wiringPi, quindi quei risultati li conosco. Quello che il test sul Pi aggiunge davvero è la parte che il laptop non può coprire: lettura reale del DHT11, movimento fisico di elica e servo, e il comportamento MQTT end-to-end. Tieni presente che `Calibrate_Sensor` e le letture possono fallire legittimamente ogni tanto (`"Sensor read failed"`) — è il motivo per cui quel servizio esiste.

**Attenzione:** Atlas non deve girare contemporaneamente, usa gli stessi pin GPIO.



=== PARTE 3 ===
Stage 3 runs in the browser **on your laptop**, not on the Pi. Stage 2 must be running first.

**Prerequisites**
- `sudo ./main` running on the Pi
- Mosquitto's WebSockets listener up: `ss -tlnp | grep mosquitto` must show **:9001**, not just :1883
- **Your laptop needs internet access.** `index.html` loads MQTT.js from `https://unpkg.com/mqtt/dist/mqtt.min.js`. If you're on the isolated private Wi-Fi with no uplink, the script won't load and nothing will work — the page will look fine but every button will be dead. If that happens, download `mqtt.min.js` next to `index.html` and change the `<script src>` to the local file.

**1. Open it and connect**

Just open `PartOne/edge/index.html` in the browser (no build step, `file://` is fine). Enter the Pi's IP, click Connect.

Expected: *Broker: connected* (green), *Device: online* (green), and the catalogue table fills with **8 rows**. The log should show `catalogue received: 8 services from RPi-1`.

Keep the browser console open (F12) — WebSocket failures surface there, not in the page.

**2. Catalogue correctness**

Check the rows match the service table: `Read_Temp` shows `#In` 1 with a box labelled `F_or_C`; the zero-input services show `–`; `Fan_Off` and `Window_Close` show output `void`.

**3. Ad-hoc Call buttons**

Type `0` in `Read_Temp`'s box and press Call. Then `75` into `Fan_On`, then `Fan_Off`, then `120` into `Set_Window`, then `Read_Window_Position` (should echo 120). Leave a box empty and press Call — it should refuse with *"must be an integer"* rather than sending anything.

**4. Order-based**

Press **Load examples**, then **Run program**. The first two statements should log `[order-based]`, two `call`/`reply` pairs each, then `chain completed`.

To test the failure path deterministically, unplug the DHT11 data wire (GPIO17) and run again: the first statement should log `chain stopped: RPi1.Calibrate_Sensor() was unsuccessful, 1 call(s) skipped` — and crucially the *second and third statements should still run*, since a failed chain stops only its own statement.

**5. Condition-based, both branches**

The example is `IF Read_Temp(0) > 28`. At room temperature that's false, so you should see `condition 22 > 28 is false` followed by `Fan_Off` running from the ELSE branch. Breathe on the DHT11 and re-run to get the true branch and `Fan_On(75)`.

Easier and more deterministic: edit the threshold in the textarea. `> 10` forces true, `> 100` forces false. Also delete the `ELSE` line and re-run with a false condition — it should log `skipped: RPi1.Fan_On(75) not run, no ELSE branch`.

**6. Parse errors**

Type garbage like `THEN Foo()` or `RUN Bar(x)` and press Run. It should report the error in the message line and the log, and send nothing to the Pi. I already verified 17 parser cases in node, so this is just confirming the errors surface in the UI.

**7. Retained catalogue**

Reload the page. The catalogue should repopulate **immediately** without you touching the Pi — that's the retained `services` message doing its job, and it's requirement 1.4.

**8. Disconnect behaviour**

`Ctrl-C` the device program. The *Device* pill should flip to **offline** (the clean shutdown publish). Press Run while it's down: each call should fail with `timeout waiting for …` after 10 seconds. Restart `./main` and the pill should return to online.

What this adds over what I already checked: the parser and the dispatch logic were verified offline, so the real value here is the live MQTT round-trip, the retained-catalogue rendering, and the orchestrator reacting to genuine replies — including the sensor failures that `Calibrate_Sensor` exists to catch.
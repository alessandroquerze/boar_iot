# Atlas MQTT su Raspberry Pi

Questa copia del middleware Atlas pubblica gli annunci dei dispositivi su Mosquitto, sotto `/Atlas/`. Le chiamate ai servizi continuano a usare TCP `6668`. L’IDE riceve gli annunci direttamente dal broker del Raspberry, senza un bridge UDP.

## Copia e avvia sul Raspberry

Copia l’intera cartella `Atlas` sul Raspberry Pi. Il binario incluso è per Raspberry Pi OS Bookworm a 64 bit o una versione successiva compatibile. Se usi SSH, da `Final_Project` in PowerShell puoi trasferirla con questo comando, sostituendo `utente` con il tuo utente sul Raspberry.

```powershell
scp -r .\Atlas utente@25.16.192.196:~/
```

Verifica che Hamachi e Mosquitto siano attivi sul Pi, poi ferma la vecchia istanza di Atlas e l’eventuale bridge. La configurazione iniziale usa `25.16.192.196:1883` per Mosquitto e l’interfaccia `ham0` per l’IPv4 che Atlas annuncia all’IDE.

```sh
cd ~/Atlas
sudo sh run.sh
```

`run.sh` avvia `bin/Atlas` se è presente, oppure `build/Atlas`. Il programma compila i servizi GPIO all’avvio. Su un Raspberry nuovo servono `build-essential`, `autogen`, `libcurl.so.4` e le librerie di sviluppo WiringPi e pigpio usate nel Lab 4. Il compilatore di risorse e la libreria CppMicroServices sono inclusi nella cartella. [Installazione di WiringPi](https://github.com/WiringPi/WiringPi#installing)

Se cambia il broker, aggiorna `Broker → IP` e `Broker → Port` nel file [ConfigurationFiles/Atlas_IoTDDL.xml](ConfigurationFiles/Atlas_IoTDDL.xml). Il valore `Module` seleziona l’interfaccia di cui Atlas annuncia l’indirizzo. Scegli un IPv4 raggiungibile dal backend dell’IDE sulla porta `6668`.

## Apri l’IDE e verifica

Da un altro terminale sul Raspberry, controlla che arrivino annunci MQTT e che Atlas ascolti per le chiamate ai servizi. Se manca `mosquitto_sub`, installa `mosquitto-clients`. In `Identity_Language`, verifica che `IP` sia `25.16.192.196` e che `Port` sia `6668`. [Documentazione Mosquitto](https://mosquitto.org/man/mosquitto_sub-1.html)

```sh
ss -ltn 'sport = :6668'
mosquitto_sub -h 25.16.192.196 -p 1883 -t '/Atlas/#' -v
```

Sul PC Windows, dalla cartella `Final_Project`, avvia il backend dell’IDE collegandolo al broker del Raspberry.

```powershell
node server/index.js --broker 25.16.192.196:1883
```

Apri `http://localhost:7000`. Lo stato atteso è `broker: connected` e nella scheda Devices compare `AT_BoarAirSensor` con il suo catalogo servizi.

## Ricompila Atlas sul Raspberry

Per ricompilare il middleware, installa anche CMake e gli header di libcurl se mancano. Dalla cartella `Atlas`, esegui la build con il tuo utente Linux.

```sh
sudo apt install build-essential cmake libcurl4-openssl-dev
cd ~/Atlas
sh build.sh --parallel 2
```

La build produce `build/Atlas`. Ferma l’istanza in esecuzione con `Ctrl+C` nel suo terminale per liberare la porta TCP `6668`, poi avvia la nuova build.

```sh
sudo sh run.sh --build
```

`sudo sh run.sh` sceglie il binario distribuito in `bin/Atlas` quando è presente.

Lo script esegue `cmake -S Main -B build` e poi `cmake --build build` con gli eventuali argomenti passati al comando. Il backend dell’IDE esegue direttamente il JavaScript. Dopo aver aggiornato il suo codice basta riavviare Node sul PC.

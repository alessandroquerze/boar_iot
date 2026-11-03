#!/usr/bin/env python3
"""
Collegamenti MCP3008 (SPI0):
  MCP3008 pin 12 (DOUT) -> GPIO9  (MISO, pin fisico 21)
  MCP3008 pin 11 (DIN)  -> GPIO10 (MOSI, pin fisico 19)
  MCP3008 pin 10 (CS)   -> GPIO8  (CE0,  pin fisico 24)
  MCP3008 pin 1  (CH0)  -> nodo centrale del partitore fotoresistenza/resistenza

"""

import time
import spidev
import RPi.GPIO as GPIO

# --- Config SPI (MCP3008) ---
SPI_BUS = 0        # bus SPI0
SPI_DEVICE = 0     # CE0 (chip select 0)
SPI_SPEED_HZ = 1350000  # velocità di clock consigliata per MCP3008

CANALE = 0          # CH0 del MCP3008
TENSIONE_RIFERIMENTO = 3.3  # volt (VREF collegato a 3.3V)
INTERVALLO_SECONDI = 0.1       # ogni quanto stampare/aggiornare una lettura

# --- Configurazione LED PWM ---
PIN_LED = 12               # GPIO12 (pin fisico 32)
FREQUENZA_PWM_HZ = 200      # frequenza PWM del LED

# Range di tensione osservato con la vostra fotoresistenza (misurato empiricamente)
TENSIONE_MIN = 2   # volt -> corrisponde a duty cycle 0%
TENSIONE_MAX = 3.13  # volt -> corrisponde a duty cycle 100%

# Se True, il LED si illumina di più quando la tensione SALE (es. più luce se la
# fotoresistenza e' collegata verso 3.3V e la resistenza fissa verso GND).
# Metti False per invertire il comportamento (LED più acceso al buio, o viceversa,
# a seconda di come e' orientato il partitore).
LED_SEGUE_TENSIONE_CRESCENTE = True


def apri_spi():
    spi = spidev.SpiDev()
    spi.open(SPI_BUS, SPI_DEVICE)
    spi.max_speed_hz = SPI_SPEED_HZ
    spi.mode = 0
    return spi


def leggi_canale(spi, canale):
    """Invia il comando SPI al MCP3008 e restituisce il valore grezzo 0-1023."""
    if not 0 <= canale <= 7:
        raise ValueError("Il canale deve essere compreso tra 0 e 7")

    # Sequenza di comando MCP3008: start bit, single-ended + numero canale, poi 0
    comando = [1, (8 + canale) << 4, 0]
    risposta = spi.xfer2(comando)

    # I 10 bit del risultato sono negli ultimi 2 byte ricevuti
    valore = ((risposta[1] & 3) << 8) | risposta[2]
    return valore


def calcola_duty_cycle(tensione):
    """Converte la tensione letta in un duty cycle 0-100% per il LED,
    usando il range TENSIONE_MIN..TENSIONE_MAX calibrato sopra."""
    intervallo = TENSIONE_MAX - TENSIONE_MIN
    if intervallo <= 0:
        return 0.0

    proporzione = (tensione - TENSIONE_MIN) / intervallo
    proporzione = max(0.0, min(1.0, proporzione))  # clamp tra 0 e 1

    if not LED_SEGUE_TENSIONE_CRESCENTE:
        proporzione = 1.0 - proporzione

    return proporzione * 100.0


def main():
    spi = apri_spi()

    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    GPIO.setup(PIN_LED, GPIO.OUT)
    pwm_led = GPIO.PWM(PIN_LED, FREQUENZA_PWM_HZ)
    pwm_led.start(0)

    print("Lettura MCP3008 - Canale CH0 (fotoresistenza) + LED PWM su GPIO12")
    print("Premi CTRL+C per interrompere.\n")

    try:
        i = 0
        while True:
            valore_grezzo = leggi_canale(spi, CANALE)
            tensione = valore_grezzo * TENSIONE_RIFERIMENTO / 1023

            duty_cycle = calcola_duty_cycle(tensione)
            pwm_led.ChangeDutyCycle(duty_cycle)

            timestamp = time.strftime("%H:%M:%S")
            if i == 10:
                print(
                    f"[{timestamp}] CH0 -> valore ADC: {valore_grezzo:4d}/1023  |  "
                    f"tensione: {tensione:.2f} V  |  LED: {duty_cycle:5.1f}%"
                )
                i = -1
            i = i + 1

            time.sleep(INTERVALLO_SECONDI)

    except KeyboardInterrupt:
        print("\nLettura interrotta dall'utente.")
    finally:
        pwm_led.stop()
        GPIO.cleanup()
        spi.close()


if __name__ == "__main__":
    main()

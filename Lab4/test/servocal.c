// Servo calibration helper.
//
// The 1-2 ms pulse range is only nominal. Most hobby servos need roughly
// 0.5-2.5 ms to reach their real end stops, so a 1-2 ms range yields about
// half the expected travel. This program finds the true endpoints: type a
// pulse width in microseconds and the arm goes there.
//
// Work outwards from 1500 in steps of 100. The moment the servo buzzes or
// strains, it is pressing against its stop: back off and use the last quiet
// value. Note down the lowest and highest quiet pulse widths.
//
// Build: gcc -o servocal servocal.c -lwiringPi
// Run:   sudo ./servocal

#include <stdio.h>
#include <signal.h>
#include <wiringPi.h>

#define SERVO_PIN  18

#define PWM_CLOCK  192
#define PWM_RANGE  2000

// 10 us per tick, so a pulse width in us maps to duty = us / 10.
#define US_PER_TICK 10

// Mechanical safety band: beyond this most servos are already stalling.
#define US_MIN 500
#define US_MAX 2500

volatile sig_atomic_t running = 1;

void stop(int sig) {
    (void)sig;
    running = 0;
}

int main(void) {
    if (wiringPiSetupGpio() == -1) {
        fprintf(stderr, "Errore inizializzazione GPIO (serve sudo)\n");
        return 1;
    }

    signal(SIGINT, stop);
    signal(SIGTERM, stop);

    pinMode(SERVO_PIN, PWM_OUTPUT);
    pwmSetMode(PWM_MODE_MS);
    pwmSetClock(PWM_CLOCK);
    pwmSetRange(PWM_RANGE);

    pwmWrite(SERVO_PIN, 1500 / US_PER_TICK);
    printf("Servo al centro (1500 us).\n");
    printf("Inserisci una larghezza di impulso in us (%d-%d), 'q' per uscire.\n",
           US_MIN, US_MAX);
    printf("Parti da 1500 e allargati di 100 alla volta in entrambe le direzioni.\n");
    printf("Se ronza o forza, ha toccato il fine corsa: torna indietro.\n\n");

    char line[64];

    while (running && fgets(line, sizeof(line), stdin) != NULL) {
        if (line[0] == 'q') break;

        int us;
        if (sscanf(line, "%d", &us) != 1) {
            printf("  valore non valido\n");
            continue;
        }

        if (us < US_MIN || us > US_MAX) {
            printf("  fuori dalla banda di sicurezza %d-%d us\n", US_MIN, US_MAX);
            continue;
        }

        int duty = us / US_PER_TICK;
        pwmWrite(SERVO_PIN, duty);
        printf("  %d us -> duty %d  (SERVO_*_PWM userebbe questo numero)\n", us, duty);
    }

    pwmWrite(SERVO_PIN, 0);
    delay(50);
    pinMode(SERVO_PIN, INPUT);

    printf("\nServo disattivato.\n");
    return 0;
}

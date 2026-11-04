// Stage 1 gate test: fan on GPIO13 (hardware PWM channel 1) alongside the
// servo on GPIO18 (channel 0).
//
// wiringPi drives both channels from one clock and pwmSetRange() writes both
// range registers, so the two share a frequency: clock 192 / range 2000 = 50 Hz.
// That is correct for the servo but low for a DC motor. This program exists to
// answer three questions before the rest of Lab 4 is built on top of it:
//   1. does the propeller spin at the 75% cap?
//   2. is the servo disturbed when the fan duty changes?
//   3. how low can the duty go before the motor stutters instead of spinning?
//
// Build: gcc -o pwm13 pwm13.c -lwiringPi
// Run:   sudo ./pwm13

#include <stdio.h>
#include <signal.h>
#include <wiringPi.h>

#define SERVO_PIN    18
#define FAN_PIN      13

#define PWM_CLOCK    192
#define PWM_RANGE    2000

// 1 ms and 2 ms pulses out of the 20 ms frame.
#define SERVO_MIN_PWM 100
#define SERVO_MAX_PWM 200

#define FAN_MAX_PCT  75

volatile sig_atomic_t running = 1;

void stop(int sig) {
    (void)sig;
    running = 0;
}

int angle_to_pwm(int angle) {
    if (angle < 0) angle = 0;
    if (angle > 180) angle = 180;

    return SERVO_MIN_PWM +
        (angle * (SERVO_MAX_PWM - SERVO_MIN_PWM)) / 180;
}

int pct_to_pwm(int pct) {
    if (pct < 0) pct = 0;
    if (pct > FAN_MAX_PCT) pct = FAN_MAX_PCT;

    return pct * PWM_RANGE / 100;
}

void shutdown_pwm(void) {
    pwmWrite(FAN_PIN, 0);
    pwmWrite(SERVO_PIN, 0);
    delay(50);
    pinMode(FAN_PIN, INPUT);
    pinMode(SERVO_PIN, INPUT);
}

int main(void) {
    if (wiringPiSetupGpio() == -1) {
        fprintf(stderr, "Errore inizializzazione GPIO\n");
        return 1;
    }

    signal(SIGINT, stop);
    signal(SIGTERM, stop);

    pinMode(SERVO_PIN, PWM_OUTPUT);
    pinMode(FAN_PIN, PWM_OUTPUT);

    // Affects both channels: mark-space mode, 19.2 MHz / 192 / 2000 = 50 Hz.
    pwmSetMode(PWM_MODE_MS);
    pwmSetClock(PWM_CLOCK);
    pwmSetRange(PWM_RANGE);

    pwmWrite(FAN_PIN, 0);
    pwmWrite(SERVO_PIN, angle_to_pwm(90));
    printf("Servo parcheggiato a 90 gradi, ventola ferma.\n");
    printf("Controlla che il servo tenga la posizione durante tutto il test.\n\n");
    delay(2000);

    // Phase 1: ramp the fan and note where it starts turning cleanly.
    printf("--- Fase 1: rampa ventola (servo fermo a 90) ---\n");
    int steps[] = { 0, 10, 20, 30, 40, 50, 60, 70, 75 };
    int n_steps = sizeof(steps) / sizeof(steps[0]);

    for (int i = 0; i < n_steps && running; i++) {
        pwmWrite(FAN_PIN, pct_to_pwm(steps[i]));
        printf("  duty %2d%% (pwm %4d) -- gira? stuttera?\n",
               steps[i], pct_to_pwm(steps[i]));
        delay(3000);
    }

    // Phase 2: move the servo while the fan runs, to check interference both ways.
    printf("\n--- Fase 2: servo in movimento con ventola al 75%% ---\n");
    int angles[] = { 0, 180, 0, 180, 90 };
    int n_angles = sizeof(angles) / sizeof(angles[0]);

    for (int i = 0; i < n_angles && running; i++) {
        pwmWrite(SERVO_PIN, angle_to_pwm(angles[i]));
        printf("  servo -> %3d gradi (pwm %3d) -- la ventola rallenta?\n",
               angles[i], angle_to_pwm(angles[i]));
        delay(2000);
    }

    // Phase 3: fan duty changes while the servo holds, the direction that matters
    // most since pwmSetClock/pwmSetRange are re-run per service call under Atlas.
    printf("\n--- Fase 3: ventola variabile con servo fermo a 90 ---\n");
    printf("  (il servo deve restare immobile)\n");

    for (int i = 0; i < 6 && running; i++) {
        int pct = (i % 2) ? 75 : 30;
        pwmSetClock(PWM_CLOCK);
        pwmSetRange(PWM_RANGE);
        pwmWrite(FAN_PIN, pct_to_pwm(pct));
        printf("  duty %2d%% -- il servo ha scattato?\n", pct);
        delay(2000);
    }

    shutdown_pwm();
    printf("\nTest terminato, uscite PWM spente.\n");
    return 0;
}

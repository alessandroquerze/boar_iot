#include <stdio.h>
#include <stdint.h>
#include <signal.h>
#include <wiringPi.h>
#include <softPwm.h>

// GPIO (numerazione BCM)
#define DHT_PIN 17
#define SERVO_PIN 18
#define MOTOR_PIN 23

// Limiti servo
#define TEMP_MIN 20.0f
#define TEMP_MAX 35.0f

#define SERVO_MIN_PWM 100
#define SERVO_MAX_PWM 200

// Limiti motore
#define MOTOR_TEMP_MIN 25.0f
#define MOTOR_TEMP_MAX 40.0f
#define MOTOR_MAX_PWM 75
#define MOTOR_PWM_RANGE 100

volatile sig_atomic_t running = 1;

void stop(int sig) {
    (void)sig;
    running = 0;
}

// Attende un livello logico con timeout
int wait_level(int level, unsigned int timeout_us) {
    unsigned int start = micros();

    while (digitalRead(DHT_PIN) != level) {
        if ((unsigned int)(micros() - start) > timeout_us)
            return 0;
    }

    return 1;
}

// Lettura DHT11
int read_dht11(float *temperature, float *humidity) {
    uint8_t data[5] = {0};

    pinMode(DHT_PIN, OUTPUT);
    digitalWrite(DHT_PIN, LOW);
    delay(20);

    pinMode(DHT_PIN, INPUT);

    if (!wait_level(HIGH, 100)) return -1;
    if (!wait_level(LOW, 100))  return -1;
    if (!wait_level(HIGH, 120)) return -1;
    if (!wait_level(LOW, 120))  return -1;

    for (int i = 0; i < 40; i++) {
        if (!wait_level(HIGH, 100))
            return -1;

        unsigned int start = micros();

        if (!wait_level(LOW, 120))
            return -1;

        unsigned int duration = micros() - start;

        data[i / 8] <<= 1;

        if (duration > 50)
            data[i / 8] |= 1;
    }

    uint8_t checksum =
        (data[0] + data[1] + data[2] + data[3]) & 0xFF;

    if (checksum != data[4])
        return -1;

    *humidity = data[0] + data[1] / 10.0f;
    *temperature = data[2] + data[3] / 10.0f;

    return 0;
}

// Temperatura -> angolo servo (0-180 gradi)
int temperature_to_angle(float temperature) {
    if (temperature <= TEMP_MIN)
        return 0;

    if (temperature >= TEMP_MAX)
        return 180;

    float ratio =
        (temperature - TEMP_MIN) /
        (TEMP_MAX - TEMP_MIN);

    return (int)(ratio * 180.0f + 0.5f);
}

// Controllo servo PWM hardware
void set_servo_angle(int angle) {
    if (angle < 0) angle = 0;
    if (angle > 180) angle = 180;

    int pwm = SERVO_MIN_PWM +
        (angle * (SERVO_MAX_PWM - SERVO_MIN_PWM)) / 180;

    pwmWrite(SERVO_PIN, pwm);
}

// Temperatura -> duty cycle motore (0-75%)
int temperature_to_motor_pwm(float temperature) {
    if (temperature <= MOTOR_TEMP_MIN)
        return 0;

    if (temperature >= MOTOR_TEMP_MAX)
        return MOTOR_MAX_PWM;

    float ratio =
        (temperature - MOTOR_TEMP_MIN) /
        (MOTOR_TEMP_MAX - MOTOR_TEMP_MIN);

    return (int)(ratio * MOTOR_MAX_PWM + 0.5f);
}

// Controllo motore PWM software
void set_motor_speed(int pwm) {
    if (pwm < 0) pwm = 0;
    if (pwm > MOTOR_MAX_PWM) pwm = MOTOR_MAX_PWM;

    softPwmWrite(MOTOR_PIN, pwm);
}

int main(void) {
    if (wiringPiSetupGpio() == -1) {
        fprintf(stderr, "Errore inizializzazione GPIO\n");
        return 1;
    }

    signal(SIGINT, stop);
    signal(SIGTERM, stop);

    // Inizializzazione DHT11
    pinMode(DHT_PIN, INPUT);
    pullUpDnControl(DHT_PIN, PUD_UP);

    // Inizializzazione servo PWM hardware (50 Hz)
    pinMode(SERVO_PIN, PWM_OUTPUT);
    pwmSetMode(PWM_MODE_MS);
    pwmSetClock(192);
    pwmSetRange(2000);
    pwmWrite(SERVO_PIN, 0);

    // Inizializzazione motore PWM software (~100 Hz)
    if (softPwmCreate(MOTOR_PIN, 0, MOTOR_PWM_RANGE) != 0) {
        fprintf(stderr, "Errore inizializzazione PWM motore\n");
        pwmWrite(SERVO_PIN, 0);
        pinMode(SERVO_PIN, INPUT);
        return 1;
    }

    delay(1000);

    int last_angle = -1;
    int last_motor_pwm = -1;
    int failed_reads = 0;

    while (running) {
        float temperature, humidity;

        if (read_dht11(&temperature, &humidity) == 0) {
            failed_reads = 0;

            // Calcolo posizione servo
            int angle = temperature_to_angle(temperature);

            if (angle != last_angle) {
                set_servo_angle(angle);
                last_angle = angle;
            }

            // Calcolo velocità motore
            int motor_pwm =
                temperature_to_motor_pwm(temperature);

            if (motor_pwm != last_motor_pwm) {
                set_motor_speed(motor_pwm);
                last_motor_pwm = motor_pwm;
            }

            // Output
            printf("Temperatura: %.1f °C\n", temperature);
            printf("Umidità: %.1f %%\n", humidity);
            printf("Angolo servo: %d°\n", angle);
            printf("PWM motore: %d%%\n", motor_pwm);
            printf("------------------------\n");

        } else {
            fprintf(stderr, "Errore lettura DHT11\n");
            failed_reads++;

            // Sicurezza: spegne il motore
            // dopo 3 letture consecutive fallite
            if (failed_reads >= 3) {
                set_motor_speed(0);
                last_motor_pwm = 0;
            }
        }

        delay(2000);
    }

    // Spegnimento motore
    set_motor_speed(0);
    delay(20);
    softPwmStop(MOTOR_PIN);
    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);

    // Disattivazione servo
    pwmWrite(SERVO_PIN, 0);
    pinMode(SERVO_PIN, INPUT);

    printf("\nProgramma terminato.\n");
    return 0;
}
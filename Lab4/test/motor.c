
#include <stdio.h>
#include <wiringPi.h>

#define MOTOR_PIN 23

int main(void) {
    if (wiringPiSetupGpio() == -1)
        return 1;

    pinMode(MOTOR_PIN, OUTPUT);
    digitalWrite(MOTOR_PIN, LOW);

    while (1) {
        digitalWrite(MOTOR_PIN, HIGH);
        printf("Motore acceso\n");
        delay(3000);

        digitalWrite(MOTOR_PIN, LOW);
        printf("Motore spento\n");
        delay(3000);
    }

    return 0;
}
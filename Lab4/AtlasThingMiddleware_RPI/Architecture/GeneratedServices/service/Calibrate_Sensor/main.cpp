
#include <cstdarg>
#include <iostream>
#include <csignal>
#include <cppmicroservices/BundleActivator.h>
extern "C" {

#include <wiringPi.h>

}

#include <service/Service.cpp>

namespace us = cppmicroservices;

// the service will always be named `Service<ServiceName>'
class ServiceCalibrate_Sensor : public Service
{
	// define static storage since the return value must return a `void*'
	// type+name gathered from the DDL `<OutputType>' and `<OutputName>'
	// FIXME: not thread-safe in its current form
	
	int Calibration = {};
	

	// use a `va_list' to get known parameters dynamically
	// the end result should allow Evaluate to be used as `auto Evaluate(...)'
	void* Evaluate(va_list args) override
	{
		// each input is gathered from the DDL `<InputType>'
		
		va_end(args);

		// codegen will be more advanced/fine-grained, eventually
		// for now, the whole function body is specified in the DDL `<Source>'
		
		#define DHT_PIN      17
		
		#define DHT_ATTEMPTS 3
		
		#define DHT_RETRY_MS 1100
		
		unsigned char data[5];
		
		int ok = 0;
		
		int levels[4] = { HIGH, LOW, HIGH, LOW };
		
		unsigned int limits[4] = { 100, 100, 120, 120 };
		
		wiringPiSetupGpio();
		
		for (int attempt = 0; attempt < DHT_ATTEMPTS && !ok; attempt++) {
		
		    if (attempt > 0) delay(DHT_RETRY_MS);
		
		    for (int k = 0; k < 5; k++) data[k] = 0;
		
		    pinMode(DHT_PIN, OUTPUT);
		
		    digitalWrite(DHT_PIN, LOW);
		
		    delay(20);
		
		    pinMode(DHT_PIN, INPUT);
		
		    pullUpDnControl(DHT_PIN, PUD_UP);
		
		    int good = 1;
		
		    for (int s = 0; s < 4 && good; s++) {
		
		        unsigned int t0 = micros();
		
		        while (good && digitalRead(DHT_PIN) != levels[s]) {
		
		            if (micros() - t0 > limits[s]) good = 0;
		
		        }
		
		    }
		
		    for (int i = 0; i < 40 && good; i++) {
		
		        unsigned int t0 = micros();
		
		        while (good && digitalRead(DHT_PIN) != HIGH) {
		
		            if (micros() - t0 > 100) good = 0;
		
		        }
		
		        unsigned int start = micros();
		
		        while (good && digitalRead(DHT_PIN) != LOW) {
		
		            if (micros() - start > 120) good = 0;
		
		        }
		
		        unsigned int duration = micros() - start;
		
		        data[i / 8] = data[i / 8] << 1;
		
		        if (duration > 50) data[i / 8] = data[i / 8] | 1;
		
		    }
		
		    if (good && ((data[0] + data[1] + data[2] + data[3]) & 0xFF) == data[4]) ok = 1;
		
		}
		
		Calibration = ok ? 1 : -1;
		
		
		// cast the static storage to a generic return type
		
		return (void*)&Calibration;
		
	}

	// confirm parameter/result types match before calling
	bool Validate(const std::vector<type>& as, type r) override
	{
		// check the parameter count is the same
		if (as.size() != 0)
			return false;
		// check the return type
		if (r != typeid(int))
			return false;

		// check each argument type
		

		return true;
	}
};

// instantiate and register the service
class ServiceActivator : public us::BundleActivator
{
	void Start(us::BundleContext ctx)
	{
		auto service = std::make_shared<ServiceCalibrate_Sensor>();
		ctx.RegisterService<Service>(service);
	}

	void Stop(us::BundleContext) {}
};

CPPMICROSERVICES_EXPORT_BUNDLE_ACTIVATOR(ServiceActivator);




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
	
	int Calibrates_the_sensor = {};
	

	// use a `va_list' to get known parameters dynamically
	// the end result should allow Evaluate to be used as `auto Evaluate(...)'
	void* Evaluate(va_list args) override
	{
		// each input is gathered from the DDL `<InputType>'
		
		va_end(args);

		// codegen will be more advanced/fine-grained, eventually
		// for now, the whole function body is specified in the DDL `<Source>'
		
		wiringPiSetupGpio();
		
		int dhtPin = 17;
		
		for (int attempt = 0; attempt < 3; attempt++) {
		
		    if (attempt > 0) delay(1100);
		
		    pinMode(dhtPin, OUTPUT);
		
		    digitalWrite(dhtPin, LOW);
		
		    delay(20);
		
		    pinMode(dhtPin, INPUT);
		
		    pullUpDnControl(dhtPin, PUD_UP);
		
		    
		
		    unsigned int t_start = micros();
		
		    while (digitalRead(dhtPin) == LOW) {
		
		        if ((micros() - t_start) > 100) break;
		
		    }
		
		    t_start = micros();
		
		    while (digitalRead(dhtPin) == HIGH) {
		
		        if ((micros() - t_start) > 100) break;
		
		    }
		
		    
		
		    unsigned char dht_data[5] = {0, 0, 0, 0, 0};
		
		    bool valid = true;
		
		    for (int i = 0; i < 40; i++) {
		
		        t_start = micros();
		
		        while (digitalRead(dhtPin) == LOW) {
		
		            if ((micros() - t_start) > 100) { valid = false; break; }
		
		        }
		
		        unsigned int pulse_start = micros();
		
		        while (digitalRead(dhtPin) == HIGH) {
		
		            if ((micros() - pulse_start) > 120) { valid = false; break; }
		
		        }
		
		        if (!valid) break;
		
		        dht_data[i / 8] <<= 1;
		
		        if ((micros() - pulse_start) > 50) dht_data[i / 8] |= 1;
		
		    }
		
		    if (valid && ((dht_data[0] + dht_data[1] + dht_data[2] + dht_data[3]) & 0xFF) == dht_data[4]) {
		
		    }
		
		}
		
		
		// cast the static storage to a generic return type
		
		return (void*)&Calibrates_the_sensor;
		
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



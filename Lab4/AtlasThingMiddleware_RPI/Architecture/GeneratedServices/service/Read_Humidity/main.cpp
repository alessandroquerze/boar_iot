
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
class ServiceRead_Humidity : public Service
{
	// define static storage since the return value must return a `void*'
	// type+name gathered from the DDL `<OutputType>' and `<OutputName>'
	// FIXME: not thread-safe in its current form
	
	int Returns_humidity = {};
	

	// use a `va_list' to get known parameters dynamically
	// the end result should allow Evaluate to be used as `auto Evaluate(...)'
	void* Evaluate(va_list args) override
	{
		// each input is gathered from the DDL `<InputType>'
		
		va_end(args);

		// codegen will be more advanced/fine-grained, eventually
		// for now, the whole function body is specified in the DDL `<Source>'
		
		#define DHT_PIN    17
		
		unsigned char data[5] = { 0 };
		
		wiringPiSetupGpio();
		
		pinMode(DHT_PIN, OUTPUT);
		
		digitalWrite(DHT_PIN, LOW);
		
		delay(20);
		
		pinMode(DHT_PIN, INPUT);
		
		pullUpDnControl(DHT_PIN, PUD_UP);
		
		for (int i = 0; i < 40; i++) {
		
		    if (!wait_level(HIGH, 100))
		
		    unsigned int start = micros();
		
		    if (!wait_level(LOW, 120))
		
		    unsigned int duration = micros() - start;
		
		    data[i / 8] <<= 1;
		
		    if (duration > 50)
		
		        data[i / 8] |= 1;
		
		}
		
		unsigned char checksum = (data[0] + data[1] + data[2] + data[3]) & 0xFF;
		
		if (checksum != data[4])
		
		*humidity = data[0];
		
		*temperature = data[2];
		
		
		// cast the static storage to a generic return type
		
		return (void*)&Returns_humidity;
		
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
		auto service = std::make_shared<ServiceRead_Humidity>();
		ctx.RegisterService<Service>(service);
	}

	void Stop(us::BundleContext) {}
};

CPPMICROSERVICES_EXPORT_BUNDLE_ACTIVATOR(ServiceActivator);



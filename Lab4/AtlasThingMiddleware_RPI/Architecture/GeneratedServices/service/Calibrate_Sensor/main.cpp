
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
		
		#define DHT_ATTEMPTS 3
		
		#define DHT_RETRY_MS 1100
		
		wiringPiSetupGpio();
		
		for (int attempt = 0; attempt < DHT_ATTEMPTS; attempt++) {
		
		    if (attempt > 0) delay(DHT_RETRY_MS);
		
		    
		
		    if (read_dht11(temperature, humidity) == 0)
		
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



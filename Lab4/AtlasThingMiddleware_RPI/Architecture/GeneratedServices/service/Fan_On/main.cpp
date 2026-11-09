
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
class ServiceFan_On : public Service
{
	// define static storage since the return value must return a `void*'
	// type+name gathered from the DDL `<OutputType>' and `<OutputName>'
	// FIXME: not thread-safe in its current form
	
	int Turns_on_fan = {};
	

	// use a `va_list' to get known parameters dynamically
	// the end result should allow Evaluate to be used as `auto Evaluate(...)'
	void* Evaluate(va_list args) override
	{
		// each input is gathered from the DDL `<InputType>'
		
		auto speed = va_arg(args, int);
		
		va_end(args);

		// codegen will be more advanced/fine-grained, eventually
		// for now, the whole function body is specified in the DDL `<Source>'
		
		int applySpeed = speed;
		
		if (applySpeed < 0) applySpeed = 0;
		
		if (applySpeed > 75) applySpeed = 75;
		
		wiringPiSetupGpio();
		
		pinMode(13, PWM_OUTPUT);
		
		pwmSetMode(PWM_MODE_MS);
		
		pwmSetClock(192);
		
		pwmSetRange(2000);
		
		pwmWrite(13, applySpeed * 2000 / 100);
		
		FILE* f = fopen("/tmp/fan_speed", "w");
		
		if (f != NULL) {
		
		    fprintf(f, "%d", applySpeed);
		
		    fclose(f);
		
		}
		
		
		// cast the static storage to a generic return type
		
		return (void*)&Turns_on_fan;
		
	}

	// confirm parameter/result types match before calling
	bool Validate(const std::vector<type>& as, type r) override
	{
		// check the parameter count is the same
		if (as.size() != 1)
			return false;
		// check the return type
		if (r != typeid(int))
			return false;

		// check each argument type
		
		if (as[0] != typeid(int))
			return false;
		

		return true;
	}
};

// instantiate and register the service
class ServiceActivator : public us::BundleActivator
{
	void Start(us::BundleContext ctx)
	{
		auto service = std::make_shared<ServiceFan_On>();
		ctx.RegisterService<Service>(service);
	}

	void Stop(us::BundleContext) {}
};

CPPMICROSERVICES_EXPORT_BUNDLE_ACTIVATOR(ServiceActivator);



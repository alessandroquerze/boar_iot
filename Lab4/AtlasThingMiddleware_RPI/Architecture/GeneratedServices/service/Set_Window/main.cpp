
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
class ServiceSet_Window : public Service
{
	// define static storage since the return value must return a `void*'
	// type+name gathered from the DDL `<OutputType>' and `<OutputName>'
	// FIXME: not thread-safe in its current form
	
	int Window_angle = {};
	

	// use a `va_list' to get known parameters dynamically
	// the end result should allow Evaluate to be used as `auto Evaluate(...)'
	void* Evaluate(va_list args) override
	{
		// each input is gathered from the DDL `<InputType>'
		
		auto angle = va_arg(args, int);
		
		va_end(args);

		// codegen will be more advanced/fine-grained, eventually
		// for now, the whole function body is specified in the DDL `<Source>'
		
		#define SERVO_PIN        18
		
		#define SERVO_CLOSED_PWM 150
		
		#define WINDOW_MAX_ANGLE 50
		
		#define SERVO_TICKS_180  200
		
		#define PWM_CLOCK  192
		
		#define PWM_RANGE  2000
		
		if (angle < 0) angle = 0;
		
		if (angle > WINDOW_MAX_ANGLE) angle = WINDOW_MAX_ANGLE;
		
		wiringPiSetupGpio();
		
		pinMode(SERVO_PIN, PWM_OUTPUT);
		
		pwmSetMode(PWM_MODE_MS);
		
		pwmSetClock(PWM_CLOCK);
		
		pwmSetRange(PWM_RANGE);
		
		pwmWrite(SERVO_PIN, SERVO_CLOSED_PWM + (angle * SERVO_TICKS_180) / 180);
		
		FILE* f = fopen("/tmp/window_angle", "w");
		
		if (f != nullptr) {
		
		    fprintf(f, "%d", angle);
		
		    fclose(f);
		
		}
		
		Window_angle = angle;
		
		
		// cast the static storage to a generic return type
		
		return (void*)&Window_angle;
		
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
		auto service = std::make_shared<ServiceSet_Window>();
		ctx.RegisterService<Service>(service);
	}

	void Stop(us::BundleContext) {}
};

CPPMICROSERVICES_EXPORT_BUNDLE_ACTIVATOR(ServiceActivator);



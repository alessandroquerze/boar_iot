
#include <cstdarg>
#include <iostream>
#include <csignal>
#include <cppmicroservices/BundleActivator.h>
extern "C" {

#include <wiringPi.h>

#include <wiringPiSPI.h>

}

#include <service/Service.cpp>

namespace us = cppmicroservices;

// the service will always be named `Service<ServiceName>'
class ServiceADCTest : public Service
{
	// define static storage since the return value must return a `void*'
	// type+name gathered from the DDL `<OutputType>' and `<OutputName>'
	// FIXME: not thread-safe in its current form
	
	int value = {};
	

	// use a `va_list' to get known parameters dynamically
	// the end result should allow Evaluate to be used as `auto Evaluate(...)'
	void* Evaluate(va_list args) override
	{
		// each input is gathered from the DDL `<InputType>'
		
		va_end(args);

		// codegen will be more advanced/fine-grained, eventually
		// for now, the whole function body is specified in the DDL `<Source>'
		
		static bool adc_initialized = false;

		
		#define SPI_CHANNEL 0

		
		#define SPI_SPEED 1350000

		
		if (!adc_initialized) {

		
		    if (wiringPiSetup() == -1) {

		
		        value = -1;

		
		        return (void*)&value;

		
		    }

		
		    if (wiringPiSPISetup(SPI_CHANNEL, SPI_SPEED) == -1) {

		
		        value = -1;

		
		        return (void*)&value;

		
		    }

		
		    adc_initialized = true;

		
		}

		
		int mcpRead0 = 0;

		
		unsigned char buffer_mcpRead0[3] = {1, (8 + 0) << 4, 0};

		
		wiringPiSPIDataRW(SPI_CHANNEL, buffer_mcpRead0, 3);

		
		mcpRead0 = ((buffer_mcpRead0[1] & 3) << 8) + buffer_mcpRead0[2];

		
		value = mcpRead0;
		
		
		// cast the static storage to a generic return type
		
		return (void*)&value;
		
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
		auto service = std::make_shared<ServiceADCTest>();
		ctx.RegisterService<Service>(service);
	}

	void Stop(us::BundleContext) {}
};

CPPMICROSERVICES_EXPORT_BUNDLE_ACTIVATOR(ServiceActivator);



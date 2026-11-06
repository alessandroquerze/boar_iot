# Atlas Thing Middleware for RaspberryPi

This is the current version (V3.0) for Atlas Thing Middleware for your RaspberryPi (IoT platform that runs a Raspbian, a free operating system based on Linux Debian)-Smart things

## How Atlas-IoT_Thing project directory is organized?

### Main/ : 
holds the entry point to compile Atlas-IoT_Thing  (readme file, cMServices shell script, cMakeLists.txt)

### Architecture/ : holds the following sub-modules of the architecture
		- Communication Manager       : holds the different communication languages supported (MQTT) and the Unix-sockets (CoAP and REST-HTTP are not supported in this version)
		- IoTDDL Parser               : parses the different sections and sub-sections of the IoT-DDL
		- Identity Parser             : builds the identity/language/entity json tweets of the thing
		- API-Generator               : generates bundles to the offered services, handle the service call and generate API to the service 
		- Knowledge Tweeting Manager  : builds the service/relationship json tweets, build tree of services-relationships, find match of the unbounded services
		- Object Engine               : currently not in this version
		- Attachment Engine           : currently not in this version
		- System Function             : set of common system functions that can be called besides the generated bundles for thing's services

### lib/ : holds the different libraries utilized in the project
		- RapidJSON : JSON parser/generator for C++ with both SAX/DOM style API (http://rapidjson.org/)
		- TinyXML2  : C++ XML parser under the ZLib license
		- PahoMQTT  : Eclipse Paho MQTT C client library
		- CoAPLib   : C implementation of the lightweight CoAP application-protocol from the noisy atom, under a BSD license
	            - Crypto++  : C++ library of the cryptographic schemes licensed under the Boost Software License 1.0
	            - OMALib    : Eclipse Wakaama (formerly liblwm2m), implementation of the Open Mobile Alliance's LightWeight M2M protocol (LwM2M)

### ConfigurationFiles/ : holds the different configuration files (e.g., Atlas IoTDDL) 
Use the [Atlas IoT-DDL Builder](https://www.cise.ufl.edu/~helal/Atlas-IoT-DDL-Builder.html)  to build an IoT-DDL file for your Atlas thing.


## Prepare your Atlas smart thing on RaspberryPi through the following steps:

### Step1: run the following linux commands through terminal:

```
sudo apt update
sudo apt upgrade
```

```
sudo apt install -y \
build-essential \
libcurl4-openssl-dev \
libboost-all-dev \
  gcc gcc-12 \
  g++ g++-12 \
  cmake cmake-data \
  cmake-curses-gui\
  doxygen \
  autogen\
  make \
  libc6-dev \
  libgcc-12-dev \
  libstdc++-12-dev \
  libstdc++6 \
  git dpkg apt
```



### Step2: Get the latest version of the middleware:
From Github, download the zip version of the middleware on your RaspberryPi, then unzip the folder.

### Step3: Install cppMicroservices library
unzip the folder named CppMicroServices-development under Atlas-IoT_Thing/lib/ of the middleware, and keep in the lib directory

```
unzip CppMicroServices-development.zip
```

```
cmake CppMicroServices-development/
```

```
sudo make
```

```
sudo make install
```

```
LD_LIBRARY_PATH=/usr/local/include
```

```
export LD_LIBRARY_PATH
```

```
sudo ldconfig
```

```
sudo mv /usr/local/include/cppmicroservices4/ ~/Desktop/
```

```
sudo mv ~/Desktop/cppmicroservices4/cppmicroservices/ /usr/local/include/
```


### Step4: Install WiringPi library and enable the hardware interfaces
```
sudo apt install git
```

```
git clone https://github.com/WiringPi/WiringPi.git
```

```
cd WiringPi
```

```
./build
```

```
sudo raspi-config
```

under “Interfacing Options”, enable both I2C and SPI

### Step5: Compile and Build Atlas middleware
Navigate to the directory of Atlas-IoT_thing (use cd command) and Compile as follows:

```
cmake Main/
```

```
make
```

### Step6: Add an IoT-DDL
Navigate to the directory of Atlas-IoT_thing and add the genenerated IoT-DDL.xml file to the /ConfigurationFiles directory (replace the default file)

### Step7: Run Atlas middleware
```
sudo ./Atlas
```






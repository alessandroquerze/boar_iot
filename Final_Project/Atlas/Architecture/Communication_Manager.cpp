/*
* FileName: Communication_Manager.cpp
* Description: Holds the different communication protocols that the thing can speak with other thing mates (CoAP, Unix Socket, MQTT, RESTful).
* Unit: the interface and communication engine of the architecture - the interface sublayer - Atlas thing architecture
* Date: August 2020
*/


#include "Communication_Manager.h"

#include <chrono>
#include <stdexcept>


//+++++++First Part: Atlas Communication Framework+++++++++++++++++++++++++++++++++++++++++++++++++++++++


std::string Communication_Manager::ThingATID = "";
std::string Communication_Manager::ThingSSID = "";
Identity_Parser 		IDP;
Attachment_Engine 		AE;
API_Generator 			GN;
Knowledge_Tweeting_Manager 	KTM;






void wait ( int seconds ){
	clock_t endwait = clock () + seconds * CLOCKS_PER_SEC ;
	while (clock() < endwait) {}
}

Communication_Manager::Communication_Manager(){

	//reading thing's main info
	cout<<"\nParsing the uploaded IoT-DDL ......"<<endl;
	IoTDDL_Parser DDLM;
    	ThingATID = DDLM.parseXMLTag("Atlas_IoTDDL","Atlas_Thing","Descriptive_Metadata","Thing_ATID");
     	ThingSSID = DDLM.parseXMLTag("Atlas_IoTDDL","Atlas_Thing","Descriptive_Metadata","Thing_SSID");
	if (ThingATID.empty() || ThingSSID.empty()) {
	    throw std::runtime_error("Set Thing_ATID and Thing_SSID in ConfigurationFiles/Atlas_IoTDDL.xml");
	}
	cout<<"\nYour Atlas thing ID is " +ThingATID+ " and your Smart Space ID " +ThingSSID <<endl;

	//generating services
	cout<<"\nGenerating bundles of your Atlas thing's services ......"<<endl;
	GN.Generate_ServicesBundles();

	//generate and prepare the tweets
	cout<<"\nBuilding the different tweets of your Atlas thing from the uploaded IoT-DDL ......"<<endl;
	
	thingTweets.clear();         //holder for all type of tweets built by your Atlas thing
        receivedTweets.clear();      //holder for all tweets received by thing mates, announced in the same smart space.
	

	IDP.parse_ThingIdentity();	
	cout<<"\n\n\n\n ... the generated Thing Identity-related Tweets:"<<endl; 		
	for(int i=0;i<IDP.ThingIdentity_tweets.size();	i++)   	
		{thingTweets.push_back(IDP.ThingIdentity_tweets[i]); 	cout<<IDP.ThingIdentity_tweets[i]<<endl; cout<<"\n\n"<<endl;}
	
	IDP.parse_ThingLanguages();
	cout<<"\n\n\n\n ... the generated Thing Languages-related Tweets:"<<endl; 
     	for(int i=0;i<IDP.ThingLanguages_tweets.size();	i++)  	
		{thingTweets.push_back(IDP.ThingLanguages_tweets[i]); 	cout<<IDP.ThingLanguages_tweets[i]<<endl; cout<<"\n\n"<<endl;}

	IDP.parse_EntityIdentity();
	cout<<"\n\n\n\n ... the generated Entity Identity-related Tweets:"<<endl; 
     	for(int i=0;i<IDP.EntityIdentity_tweets.size();	i++)  	
		{thingTweets.push_back(IDP.EntityIdentity_tweets[i]); 	cout<<IDP.EntityIdentity_tweets[i]<<endl; cout<<"\n\n"<<endl;}
	
	KTM.parse_ThingServices();
	cout<<"\n\n\n\n ... the generated Services-related Tweets:"<<endl; 
	for(int i=0;i<KTM.Services_tweets.size(); i++)    
		{thingTweets.push_back(KTM.Services_tweets[i]); 	cout<<KTM.Services_tweets[i]<<endl; cout<<"\n\n"<<endl;}
 	    
	KTM.parse_ThingRelationships();	
	cout<<"\n\n\n\n ... the generated Relationship-related Tweets:"<<endl; 
	for(int i=0;i<KTM.Relationships_tweets.size(); i++)   	
		{thingTweets.push_back(KTM.Relationships_tweets[i]); 	cout<<KTM.Relationships_tweets[i]<<endl; cout<<"\n\n"<<endl;}
     	


	cout<<"\n\n\n\n\nInitializing the interface and communication engine ................"<<endl;

	//Socket attributes, common properties for all Atlas things
    	MulticastPort 	= 1235;                      //port the multicast socket is listening to/sending on
    	MulticastIP 	= (char *) "232.1.1.1";      //IP the multicast socket is listening to/sending on
    	ServerPort 	= 6668;                      //thing's port the unicast socket listening to


    // The broker and topic tags live under separate elements in the IoT-DDL.
    const auto mqttField = [&DDLM](const char* section, const char* field) {
        return DDLM.parseXMLTag("Atlas_IoTDDL", "Atlas_Thing", "Administrative_Metadata",
                               "Network_Manager", "InterOperableCommunication", section, field);
    };
    const std::string broker = mqttField("Broker", "IP");
    const std::string brokerPort = mqttField("Broker", "Port");
    RootTOPIC = mqttField("Topic", "Root");
    MulticastThingIdTOPIC = mqttField("Topic", "Multicast_ThingIdentity");
    MulticastEntityIdTOPIC = mqttField("Topic", "Multicast_EntityIdentity");
    MulticastAPITOPIC = mqttField("Topic", "Multicast_API");
    const bool numericPort = !brokerPort.empty() && brokerPort.size() <= 5 &&
                             brokerPort.find_first_not_of("0123456789") == std::string::npos;
    const unsigned long port = numericPort ? std::stoul(brokerPort) : 0;
    if (broker.empty() || port == 0 || port > 65535) {
        throw std::runtime_error("Set a valid MQTT broker IP and port in ConfigurationFiles/Atlas_IoTDDL.xml");
    }
    if (RootTOPIC.empty() || MulticastThingIdTOPIC.empty() ||
        MulticastEntityIdTOPIC.empty() || MulticastAPITOPIC.empty()) {
        throw std::runtime_error("Set the MQTT topics in ConfigurationFiles/Atlas_IoTDDL.xml");
    }

    ADDRESS = "tcp://" + broker + ":" + brokerPort;
    CLIENTID_publish = ThingATID + "-pub";
    CLIENTID_subscribe = ThingATID + "-sub";
    QOS = 1;

}

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//+++++++++++++++++++++++++++Socket Functions++++++++++++++++++++++++++++++++++
//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

void Communication_Manager::BroadcastTweets_IPSocket(){
     	
	cout<<"\n\n\nYour Atlas thing started to announce the tweets to the smart space through IP Socket multicasting ...."<<endl;

     	struct sockaddr_in addr;
     	int i=0, fd, cnt;
     	struct ip_mreq mreq;
     	if ((fd=socket(AF_INET,SOCK_DGRAM,0)) < 0) 
		{  perror("socket"); cout<<"Problem with the IP multicast Broadcast"<<endl; return; }

     	memset(&addr,0,sizeof(addr));
     	addr.sin_family      =	AF_INET;
     	addr.sin_addr.s_addr =	inet_addr(MulticastIP);
     	addr.sin_port        =	htons(MulticastPort);

     	while (1) {
	  	char tabx[4048];
	  	strcpy(tabx, thingTweets[i].c_str());
          	cout<<"\n\nAnnouncing tweet: "<<tabx<<endl;
          	cout<<"\n\n"<<endl;
	  	if (sendto(fd,tabx,thingTweets[i].length(),0,(struct sockaddr *) &addr,sizeof(addr)) < 0) 
			{cout<<"ERROR writing to socket"<<endl;  continue; }
	  	
		if (i < thingTweets.size()-1)   	
			{i = i + 1; 	 wait(3); }  //wait for 3 seconds between each multicast
	  	else   	{
			i = 0;     
          		cout<<"All tweets have been announced, after 20 seconds they will be announced again"<<endl;
			wait(20);      //wait for 20 seconds to start the cycle again 
		} 
     	}
}


void Communication_Manager::CaptureMatesTweets_IPSocket(){

     	struct sockaddr_in addr;
     	int fd, nbytes,addrlen;
     	struct ip_mreq mreq;
     	char msgbuf[MSGBUFSIZE];
     	u_int yes=1;

     	if ((fd=socket(AF_INET,SOCK_DGRAM,0)) < 0) 
		{ perror("socket"); cout<<"Problem with receiving the IP multicasted tweets"<<endl; return;  }
    	if (setsockopt(fd,SOL_SOCKET,SO_REUSEADDR,&yes,sizeof(yes)) < 0) 
		{ perror("Reusing ADDR failed");  cout<<"Problem with receiving the IP multicasted tweets"<<endl; return;  }

     	
	memset(&addr,0,sizeof(addr));
     	addr.sin_family      = 	AF_INET;
     	addr.sin_addr.s_addr = 	htonl(INADDR_ANY);
     	addr.sin_port        = 	htons(MulticastPort);
     	if (bind(fd,(struct sockaddr *) &addr,sizeof(addr)) < 0) 
		{ perror("bind");  cout<<"Problem with receiving the IP multicasted tweets"<<endl; return;  }

     	
	mreq.imr_multiaddr.s_addr = inet_addr(MulticastIP);
     	mreq.imr_interface.s_addr = htonl(INADDR_ANY);
     	if (setsockopt(fd,IPPROTO_IP,IP_ADD_MEMBERSHIP,&mreq,sizeof(mreq)) < 0) 
		{ perror("setsockopt"); cout<<"Problem with receiving the IP multicasted tweets"<<endl; return; }


     	while (1) {
		memset(msgbuf, 0 ,MSGBUFSIZE);
	  	addrlen=sizeof(addr);
	  	if ((nbytes=recvfrom(fd,msgbuf,MSGBUFSIZE,0,(struct sockaddr *) &addr,(socklen_t*)&addrlen)) < 0) 
			{ perror("recvfrom"); exit(1); }    
		
		string received 	= 	msgbuf;
		std::size_t found	=	0;
		found = received.find(ThingATID);
		if(found!=std::string::npos){
			//Ignore receiving a self tweet (tweet annoucned by your Atlas thing before)
		}else{
			char json[4048];
			strcpy(json, received.c_str());
			Document document;  
			char buffer[4048];
			memcpy(buffer, json, sizeof(json));
			if (document.ParseInsitu(buffer).HasParseError()) { 
				cout<<"received unformated tweet: "<< received<<endl;  continue;
			}
			assert(document.IsObject());
			assert(document["Space ID"].IsString());
			string tweetType = document["Tweet Type"].GetString();
			if(tweetType == "Identity_Thing"){
          			cout<<"Received thing-identity tweet from a thing mate......."<<endl;
				IDP.parse_mateIdentityTweet(received);
			}else if(tweetType == "Identity_Language"){
          			cout<<"Received thing-language tweet from a thing mate...."<<endl;
				IDP.parse_mateLanguageTweet(received);
			}else if(tweetType == "Identity_Entity"){
          			cout<<"Received entity-identity tweet from a thing mate......"<<endl;
				IDP.parse_mateEntityTweet(received);
			}else if(tweetType == "Service"){
          			cout<<"Received thing-service tweet from a thing mate.............."<<endl;
				KTM.parse_mateServicesTweet(received);
			}else if(tweetType == "Relationship"){
          			cout<<"Received thing-relationship tweet from a thing mate........."<<endl;
				KTM.parse_mateRelationsTweet(received);
			}else{
          			cout<<"Received unsupported tweet type from a thing mate....."<<endl;
			}
		}
     	}
}


void Communication_Manager::CaptureAPIcalls_IPSocket(){

	printf("Your Atlas thing is now ready to accept calls for the offered services .... \n");
	int n, sockfd, newsockfd, portno;
	socklen_t clilen;
	char buffer2[4048];
	char tabx[4048];
	struct sockaddr_in serv_addr, cli_addr;
	sockfd = socket(AF_INET, SOCK_STREAM, 0);
	if (sockfd < 0)     
		{perror("ERROR opening socket");   close(sockfd);}
	bzero((char *) &serv_addr, sizeof(serv_addr));

	portno                    = ServerPort;
	serv_addr.sin_family      = AF_INET;
	serv_addr.sin_addr.s_addr = INADDR_ANY;
	serv_addr.sin_port        = htons(portno);
	if (bind(sockfd, (struct sockaddr *) &serv_addr,sizeof(serv_addr)) < 0) 
		{perror("ERROR on binding");   close(sockfd);}
			
	listen(sockfd,5);
	clilen = sizeof(cli_addr);
	std::size_t found=0;

	while(1){	
		newsockfd = accept(sockfd, (struct sockaddr *) &cli_addr, &clilen);
		if (newsockfd < 0)  	
			{perror("no client to accept");    close(newsockfd);   continue;}
		bzero(buffer2,4048);
		n = read(newsockfd,buffer2,4048);
		if (n < 0)  		
			{perror("ERROR reading from socket");      close(newsockfd);   continue;}
                
		cout<<"Accepting unicast tweet from a thing mate...."<<endl;

		string resultJSONs;
		char json[4048];
		strcpy(json, buffer2);
		Document document;  
		char buffer[4048];
		memcpy(buffer, json, sizeof(json));
		
		if (document.ParseInsitu(buffer).HasParseError()) 
			{  cout<<"received unformated tweet: "<< buffer<<endl;  continue; }
		
		assert(document.IsObject());

		if(ThingATID != document["Thing ID"].GetString()){
          		cout<<"The received unicast tweet dosn't match your thing id......."<<endl;
			string x1 = "\"Status\" : \"ATID doesn't match\"";
			resultJSONs = " { " + x1 + " }";
		}else if(ThingSSID != document["Space ID"].GetString()){
          		cout<<"The received unicast tweet dosn't match your space id......."<<endl;
			string x1 = "\"Status\" : \"SSID doesn't match\"";
			resultJSONs = " { " + x1 + " }";
		}else{
          		cout<<"processing the received API Call tweet......."<<endl;
			resultJSONs = GN.Handle_ServiceCall(json);
		}

		strcpy(tabx, resultJSONs.c_str());
		n = write(newsockfd,tabx, resultJSONs.length());
		if (n < 0) 
			{perror("ERROR writing to socket");     close(newsockfd);      continue;}
          	
		cout<<"done processing the received API Call tweet........"<<endl;
		close(newsockfd);
		// wait(3); // The next TCP call can be accepted as soon as this one closes.
	}
	close(sockfd);
}


void Communication_Manager::InitiateAPICall_IPSocket(char* MateIP, int MatePort, std::string APICall_Tweet){

	printf("Your Atlas thing is trying to send an API call for a service offered by another thing mate .... \n");
	
	char tabx[1024];
	char bufferc[1024];
	int i=0,s0,peeraddr_len;
	struct sockaddr_in peeraddr;

	s0 = socket(AF_INET, SOCK_STREAM, 0);
	if (s0 < 0) 
		{ perror("Cannot create a socket"); close(s0); return; }

	memset(&peeraddr, 0, sizeof(peeraddr));
	struct hostent *host = gethostbyname(MateIP);
	peeraddr.sin_family = AF_INET;
	peeraddr.sin_port   = htons(MatePort);
	if (host == NULL) 
		{  perror("Cannot define host address"); close(s0); return; }


	memmove(&(peeraddr.sin_addr.s_addr), host->h_addr_list[0], 4);
	int res = connect(s0, (struct sockaddr*) &peeraddr, sizeof(peeraddr));
	if (res < 0) 
		{ perror("cannot connect to the remote thing mate using IP sockets"); close(s0); return; }

	printf("Your thing successfully connected to the other thing mate to trigger a service \n");

	
	//sending APICall_Tweet throught sockets.

	strcpy(tabx, APICall_Tweet.c_str());
	write(s0, tabx, APICall_Tweet.length());
	
	res = read(s0, bufferc, 1024);
	if (res < 0) { perror("cannot read the thing mate reply");  close(s0); return;  }
	
	string resultJSONs;
	char json[4048];
	strcpy(json, bufferc);
	Document document;  
	char buffer[4048];
	memcpy(buffer, json, sizeof(json));
		
	if (document.ParseInsitu(buffer).HasParseError()) 
		{  cout<<"received unformated response: "<< buffer<<endl;  close(s0); return; }
		
	assert(document.IsObject());
	cout<<"received correct response: "<< buffer<<endl;

	close(s0);
}



//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//+++++++++++++++++++++++++++MQTT Functions++++++++++++++++++++++++++++++++++++
//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

volatile MQTTClient_deliveryToken deliveredtoken;
void delivered(void *context, MQTTClient_deliveryToken dt){
    	printf("Message with token value %d delivery confirmed\n", dt);
    	deliveredtoken = dt;
}

int msgarrvd(void *context, char *topicName, int topicLen, MQTTClient_message *message){

	std::string receivedN= (char *)(message->payload);
	std::size_t pos = receivedN.find("}");
  	std::string received = receivedN.substr (0, pos+1);

	std::size_t found	=	0;
	found = received.find(Communication_Manager::ThingATID);
	if(found!=std::string::npos){
			cout<<"Received a self tweet (tweet annoucned by your Atlas thing before)"<<endl;
			cout<<"------------------------------------------------------------------"<<endl;
	}else{

			char json[4048];
			strcpy(json, received.c_str());
			Document document;  
			char buffer[4048];
			memcpy(buffer, json, sizeof(json));
			if (document.ParseInsitu(buffer).HasParseError()) { 
				cout<<"received the following unformated tweet: "<< received<<endl;
				cout<<"------------------------------------------------------------------"<<endl;
  				return 1;			
			}

			int i;

		    	printf("\n\n Tweet received under topic: %s\n", topicName);
		    	printf("  and the message: ");  
			cout<<received<<endl;  	
			char* payloadptr = (char *)message->payload;
		    	//for(i=0; i<message->payloadlen; i++)    putchar(*payloadptr++);    	
			//putchar('\n');


			assert(document.IsObject());
			assert(document["Space ID"].IsString());
			string tweetType = document["Tweet Type"].GetString();
			if(tweetType == "Identity_Thing"){
          			cout<<"Received thing-identity tweet from a thing mate......."<<endl;
				IDP.parse_mateIdentityTweet(received);
			}else if(tweetType == "Identity_Language"){
          			cout<<"Received thing-language tweet from a thing mate...."<<endl;
				IDP.parse_mateLanguageTweet(received);
			}else if(tweetType == "Identity_Entity"){
          			cout<<"Received entity-identity tweet from a thing mate......"<<endl;
				IDP.parse_mateEntityTweet(received);
			}else if(tweetType == "Service"){
          			cout<<"Received thing-service tweet from a thing mate.............."<<endl;
				KTM.parse_mateServicesTweet(received);
			}else if(tweetType == "Relationship"){
          			cout<<"Received thing-relationship tweet from a thing mate........."<<endl;
				KTM.parse_mateRelationsTweet(received);
			}else{
          			cout<<"Received unsupported tweet type from a thing mate....."<<endl;
			}
	}

    	MQTTClient_freeMessage(&message);
    	MQTTClient_free(topicName);
    	return 1;
}

void connlost(void *context, char *cause){ printf("\nConnection lost  cause: %s\n", cause); }

void Communication_Manager::MQTT_Subscribe(){
	cout<<"Your Atlas thing is subscribed to MQTT Atlas topics to capture the announced tweets ...."<<endl;
    	MQTTClient client;
    	MQTTClient_connectOptions conn_opts = MQTTClient_connectOptions_initializer;
    	int rc, ch;
    	MQTTClient_create(&client, (char*)(ADDRESS.c_str()), (char*)(CLIENTID_subscribe.c_str()), MQTTCLIENT_PERSISTENCE_NONE, NULL);
    	conn_opts.keepAliveInterval = 20;
    	conn_opts.cleansession = 1;
    	MQTTClient_setCallbacks(client, NULL, connlost, msgarrvd, delivered);
    	if ((rc = MQTTClient_connect(client, &conn_opts)) != MQTTCLIENT_SUCCESS)
		{printf("Failed to connect, return code %d\n", rc);  exit(EXIT_FAILURE);}

	std::string TOPIC_Sub = RootTOPIC + "/#";
    	MQTTClient_subscribe(client, (char*)(TOPIC_Sub.c_str()), QOS);

    	while(1);
    	MQTTClient_disconnect(client, 10000);
    	MQTTClient_destroy(&client);
}

void Communication_Manager::MQTT_Publish() {
    MQTTClient client = nullptr;
    const int createResult = MQTTClient_create(&client, ADDRESS.c_str(), CLIENTID_publish.c_str(),
                                               MQTTCLIENT_PERSISTENCE_NONE, nullptr);
    if (createResult != MQTTCLIENT_SUCCESS) {
        std::cerr << "Cannot create the Atlas MQTT client (Paho " << createResult << ")" << std::endl;
        return;
    }

    MQTTClient_connectOptions options = MQTTClient_connectOptions_initializer;
    options.keepAliveInterval = 30;
    options.connectTimeout = 5;
    options.cleansession = 1;

    const auto publishTweets = [&](const std::string& suffix, const std::vector<std::string>& tweets) {
        const std::string topic = RootTOPIC + suffix;
        for (const auto& tweet : tweets) {
            MQTTClient_message message = MQTTClient_message_initializer;
            // Paho's C API accepts a mutable pointer but copies this payload.
            message.payload = const_cast<char*>(tweet.data());
            message.payloadlen = static_cast<int>(tweet.size());
            message.qos = QOS;
            MQTTClient_deliveryToken token;
            int result = MQTTClient_publishMessage(client, topic.c_str(), &message, &token);
            if (result == MQTTCLIENT_SUCCESS) {
                result = MQTTClient_waitForCompletion(client, token, TIMEOUT);
            }
            if (result != MQTTCLIENT_SUCCESS) {
                std::cerr << "Atlas MQTT publish failed on " << topic << " (Paho " << result
                          << "). Reconnecting." << std::endl;
                return false;
            }
        }
        return true;
    };

    for (;;) {
        if (!MQTTClient_isConnected(client)) {
            const int result = MQTTClient_connect(client, &options);
            if (result != MQTTCLIENT_SUCCESS) {
                std::cerr << "Atlas MQTT connection to " << ADDRESS << " failed (Paho " << result
                          << "). Retrying." << std::endl;
                std::this_thread::sleep_for(std::chrono::seconds(3));
                continue;
            }
            std::cout << "Atlas MQTT connected to " << ADDRESS << ", publishing under "
                      << RootTOPIC << "/#" << std::endl;
        }

        // Repeat the whole catalog so an IDE that starts later can discover it.
        if (publishTweets(MulticastThingIdTOPIC, IDP.ThingIdentity_tweets) &&
            publishTweets(MulticastThingIdTOPIC, IDP.ThingLanguages_tweets) &&
            publishTweets(MulticastEntityIdTOPIC, IDP.EntityIdentity_tweets) &&
            publishTweets(MulticastAPITOPIC, KTM.Services_tweets) &&
            publishTweets(MulticastAPITOPIC, KTM.Relationships_tweets)) {
            std::this_thread::sleep_for(std::chrono::seconds(10));
        } else {
            MQTTClient_disconnect(client, 0);
            std::this_thread::sleep_for(std::chrono::seconds(3));
        }
    }
}

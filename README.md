# openrouter_V2
openrouter attempt again

works brilliant! make sure to use the correct website and api key that is in my first openrouter attempt

website: 

https://openrouterchatbot.netlify.app/chatbot.html?

To download the data from the database use the local file that is saved under "RESEARCH PROJECTS", "AI CHATBOTS". 

This accesses the Firestore database where my chatbot data are stored. This was quite a hassle, as the database is locked down hard. 
This code can be run locally, and saves the file to the folder where this code is stored. These data will then be loaded
into another program for analysis. 

Firestore is a bit of a hassle to setup, you must set up a "Service Account" and export the .json file, then save it as "credentials.json" int eh same location as the python app to export data. In the "Rules" you must also include    

// Add this rule to explicitly allow collection group queries on all 'messages' subcollections
    match /{path=**}/messages/{docId} {
    
to allow it to cycle through the logged conversations.

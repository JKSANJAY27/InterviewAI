import asyncio
from deepgram import DeepgramClient, DeepgramClientOptions, LiveTranscriptionEvents, LiveOptions
import os

async def main():
    api_key = os.getenv("DEEPGRAM_API_KEY")
    client = DeepgramClient(api_key)
    connection = client.listen.asyncwebsocket.v("1")
    
    options = LiveOptions(
        model="nova-2",
        language="en-US",
        smart_format=True,
        interim_results=True,
    )
    
    res = await connection.start(options)
    print("START RESULT:", res)

asyncio.run(main())

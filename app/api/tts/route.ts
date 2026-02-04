import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, language = 'ka' } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_TTS_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'TTS API key not configured' },
        { status: 500 }
      );
    }

    const languageCode = language === 'ka' ? 'ka-GE' : 
                        language === 'en' ? 'en-US' : 
                        language === 'ru' ? 'ru-RU' : 'ka-GE';

    const ttsRequest = {
      input: { text },
      voice: {
        languageCode: languageCode,
        name: language === 'ka' ? 'ka-GE-Standard-A' : 
              language === 'en' ? 'en-US-Standard-C' : 
              language === 'ru' ? 'ru-RU-Standard-A' : 'ka-GE-Standard-A',
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3',
        pitch: 0,
        speakingRate: 1.0
      }
    };

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ttsRequest),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google TTS Error:', errorData);
      return NextResponse.json(
        { error: 'TTS synthesis failed', details: errorData },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      audioContent: data.audioContent,
      language: languageCode
    });

  } catch (error) {
    console.error('TTS Route Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

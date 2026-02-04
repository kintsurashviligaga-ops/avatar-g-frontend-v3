import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    const prompt = formData.get('prompt') as string;
    const language = formData.get('language') as string || 'ka';

    if (!image) {
      return NextResponse.json(
        { error: 'Image is required' },
        { status: 400 }
      );
    }

    const bytes = await image.arrayBuffer();
    const base64Image = Buffer.from(bytes).toString('base64');
    const mimeType = image.type;

    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Vision API not configured' },
        { status: 500 }
      );
    }

    const visionRequest = {
      contents: [{
        parts: [
          {
            text: prompt || (language === 'ka' ? 'აღწერე ეს სურათი დეტალურად' : 
                            language === 'en' ? 'Describe this image in detail' : 
                            'Опиши это изображение подробно')
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          }
        ]
      }]
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visionRequest),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Vision API Error:', error);
      return NextResponse.json(
        { error: 'Vision analysis failed' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const description = data.candidates?.[0]?.content?.parts?.[0]?.text || 
                       (language === 'ka' ? 'სურათის ანალიზი ვერ მოხერხდა' : 
                        language === 'en' ? 'Could not analyze image' : 
                        'Не удалось проанализировать изображение');

    return NextResponse.json({
      success: true,
      description,
      language
    });

  } catch (error) {
    console.error('Vision Route Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

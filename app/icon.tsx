import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: 'linear-gradient(to bottom right, #05070A, #0A0A0A)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
        }}
      >
        <svg viewBox="0 0 200 200" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
          <path d="M100 20 L110 40 L90 40 Z" fill="#D4AF37" stroke="#00FFFF" strokeWidth="2"/>
          <rect x="85" y="35" width="30" height="70" fill="#00FFFF" stroke="#D4AF37" strokeWidth="2" rx="3"/>
          <circle cx="100" cy="55" r="6" fill="#0A0A0A" stroke="#D4AF37" strokeWidth="1.5"/>
          <path d="M85 80 L70 95 L85 85 Z" fill="#D4AF37" stroke="#00FFFF" strokeWidth="1.5"/>
          <path d="M115 80 L130 95 L115 85 Z" fill="#D4AF37" stroke="#00FFFF" strokeWidth="1.5"/>
          <rect x="90" y="95" width="20" height="15" fill="#FF6B6B" stroke="#FFA500" strokeWidth="1"/>
        </svg>
      </div>
    ),
    {
      width: 192,
      height: 192,
    }
  );
}

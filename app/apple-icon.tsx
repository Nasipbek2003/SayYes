import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: 'linear-gradient(135deg, #E8625A 0%, #FF9A76 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="100"
          height="100"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 7.5L10.5 5.5C9 3.5 6 3 4.5 5C3 7 3.5 9.5 5 11.5L12 19L19 11.5C20.5 9.5 21 7 19.5 5C18 3 15 3.5 13.5 5.5L12 7.5Z"
            fill="white"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}

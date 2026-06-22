import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: '#E8625A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="22"
          height="22"
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

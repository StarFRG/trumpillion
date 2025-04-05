import React, { memo } from 'react';

export const Logo: React.FC = memo(() => {
  return (
    <div className="flex items-center">
      <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white">
        Trumpillion
        <span className="text-red-500 ml-[-2px]">.</span>
      </h1>
    </div>
  );
});

Logo.displayName = 'Logo';

export default Logo;
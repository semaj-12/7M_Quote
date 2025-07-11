import * as React from "react";

const Button = ({ className = "", ...props }) => {
  return (
    <button
      className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors border rounded-md shadow-sm bg-blue-600 text-white hover:bg-blue-700 ${className}`}
      {...props}
    />
  );
};

export { Button };

import * as React from "react";

const Tabs = ({ children }) => <div>{children}</div>;

const TabsList = ({ children, className = "" }) => (
  <div className={`flex space-x-2 mb-4 ${className}`}>{children}</div>
);

const TabsTrigger = ({ value, children, onClick }) => (
  <button
    className="px-4 py-2 text-sm font-medium bg-gray-200 rounded hover:bg-gray-300"
    onClick={() => onClick?.(value)}
  >
    {children}
  </button>
);

const TabsContent = ({ value, children }) => <div>{children}</div>;

export { Tabs, TabsList, TabsTrigger, TabsContent };
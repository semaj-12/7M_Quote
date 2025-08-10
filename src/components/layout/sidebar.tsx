import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  onLogout: () => void;
}

export default function Sidebar({ onLogout }: SidebarProps) {
  const location = useLocation();

  const navLinks = [
    { name: "Dashboard", path: "/" },
    { name: "New Quote", path: "/new-quote" },
    { name: "Quote History", path: "/quote-history" },
    { name: "PDF Drawings", path: "/pdf-drawings" },
    { name: "Material Costs", path: "/material-costs" },
    { name: "Company Setup", path: "/company-setup" },
  ];

  return (
    <div className="w-64 bg-white shadow-md flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold text-gray-800">7M Quote</h2>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {navLinks.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className={`block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100 ${
              location.pathname === link.path ? "bg-gray-200 font-semibold" : ""
            }`}
          >
            {link.name}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t">
        <Button
          onClick={onLogout}
          className="w-full bg-red-500 hover:bg-red-600 text-white"
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

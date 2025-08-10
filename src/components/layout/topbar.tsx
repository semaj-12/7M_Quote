import { Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  title: string;
  subtitle: string;
  onNewQuote?: () => void;
}

export default function TopBar({ title, subtitle, onNewQuote }: TopBarProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-4">
          {/* Notification Bell */}
          <button className="relative p-2 text-gray-400 hover:text-gray-600">
            <Bell className="h-5 w-5" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          
          {/* Quick Actions */}
          {onNewQuote && (
            <Button onClick={onNewQuote} className="bg-primary text-white hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              New Quote
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

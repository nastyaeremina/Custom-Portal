"use client";

import { cn } from "@/lib/utils/cn";

interface SidebarProps {
  companyName: string;
  logoUrl: string | null;
  backgroundColor: string;
  textColor: string;
}

const MENU_ITEMS = [
  { icon: "chat", label: "Messages", badge: 1 },
  { icon: "folder", label: "Files" },
  { icon: "home", label: "Home", active: true },
  { icon: "form", label: "Forms" },
  { icon: "billing", label: "Billing", badge: 1 },
  { icon: "tasks", label: "Tasks", badge: 2 },
  { icon: "contract", label: "Contracts" },
  { icon: "store", label: "Store" },
];

const icons: Record<string, React.ReactNode> = {
  chat: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  folder: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  home: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  form: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  billing: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  tasks: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  contract: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  store: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  ),
};

export function Sidebar({
  companyName,
  logoUrl,
  backgroundColor,
  textColor,
}: SidebarProps) {
  return (
    <div
      className="w-48 flex flex-col py-5 px-3 rounded-l-xl"
      style={{ backgroundColor, color: textColor }}
    >
      {/* Logo/Company */}
      <div className="flex items-center gap-2.5 mb-6 px-2">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={companyName}
            className="w-6 h-6 object-contain rounded"
          />
        ) : (
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: textColor, color: backgroundColor }}
          >
            {companyName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="font-medium text-sm truncate">{companyName}</span>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 space-y-0.5">
        {MENU_ITEMS.map((item) => (
          <button
            key={item.label}
            className={cn(
              "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              item.active
                ? "bg-white/15"
                : "hover:bg-white/5"
            )}
            style={{ color: textColor }}
          >
            {icons[item.icon]}
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span
                className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] rounded-full"
                style={{ backgroundColor: textColor, color: backgroundColor }}
              >
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  requiresSuperAdmin?: boolean;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Clients', href: '/clients', icon: '👥', requiresSuperAdmin: true },
  { name: 'Scans', href: '/scans', icon: '🔎', requiresSuperAdmin: true },
  { name: 'Findings', href: '/findings', icon: '🔍' },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await apiClient.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      // Not logged in, redirect to login
      if (pathname !== '/login') {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    apiClient.clearToken();
    router.push('/login');
  };

  // Don't show nav on login page
  if (pathname === '/login' || loading) {
    return null;
  }

  const isSuperAdmin = user?.role === 'super_admin';
  const filteredNav = navigation.filter(item => !item.requiresSuperAdmin || isSuperAdmin);

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen sticky top-0">
      {/* Logo/Header */}
      <div className="p-6 border-b border-gray-200">
        <Link href="/dashboard" className="block">
          <h1 className="text-xl font-bold text-gray-900">LaunchSecure</h1>
          <p className="text-xs text-gray-500 mt-1">Compliance Platform</p>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3 px-3 py-2 text-sm mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 font-medium truncate">{user?.email || 'User'}</p>
            <p className="text-xs text-gray-500">
              {user?.role === 'super_admin' ? 'Super Admin' : 'Client User'}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2 text-sm text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}

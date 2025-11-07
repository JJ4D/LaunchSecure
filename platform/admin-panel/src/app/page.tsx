'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = apiClient.getToken();
        if (token) {
          // Verify token is still valid
          try {
            await apiClient.getCurrentUser();
            router.push('/dashboard');
            return;
          } catch (error) {
            // Token invalid, clear it
            apiClient.clearToken();
          }
        }
        
        // Check if any super admin exists
        // If not, redirect to setup
        // For now, just go to login - user can access /setup directly
        router.push('/login');
      } catch (error) {
        router.push('/login');
      } finally {
        setChecking(false);
      }
    };

    checkAuth();
  }, [router]);

  if (checking) {
    return (
      <main className="min-h-screen p-8 flex items-center justify-center">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    );
  }

  return null;
}


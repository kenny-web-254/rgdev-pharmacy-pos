import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isNativeOnline, setIsNativeOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsNativeOnline(true);
    const handleOffline = () => setIsNativeOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isOnline = isNativeOnline && !isSimulatedOffline;

  const toggleSimulatedOffline = () => {
    setIsSimulatedOffline((prev) => !prev);
  };

  return {
    isOnline,
    isNativeOnline,
    isSimulatedOffline,
    toggleSimulatedOffline,
  };
}

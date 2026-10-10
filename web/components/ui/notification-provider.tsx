'use client';

import { useSyncExternalStore } from 'react';
import { useNotification } from '@/hooks/use-notification';

import * as Notification from '@/components/ui/notification';

// Phones show toasts at the top, larger screens at the bottom right. Swiping dismisses them the way they came in.
const PHONE = '(max-width: 639px)';
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

const NotificationProvider = () => {
  const { notifications } = useNotification();
  const phone = useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);

  return (
    <Notification.Provider swipeDirection={phone ? 'up' : 'right'}>
      {notifications.map(({ id, ...rest }) => {
        return <Notification.Root key={id} {...rest} />;
      })}
      <Notification.Viewport />
    </Notification.Provider>
  );
};

export { NotificationProvider };

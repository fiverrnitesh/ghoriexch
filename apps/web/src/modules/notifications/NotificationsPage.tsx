import { useEffect, useState } from 'react';
import type { PaginatedResponse } from '@games/shared';
import { api } from '../../lib/api-client';
import { Notification, LoadingState, EmptyState } from '../../design-system';

interface NotificationItem {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  createdAt: string;
}

export function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<PaginatedResponse<NotificationItem>>('/api/notifications')
      .then((r) => setItems(r.items))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState message="Loading notifications..." />;

  if (items.length === 0) {
    return <EmptyState title="No notifications" description="You're all caught up." />;
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Notifications</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map((n) => (
          <Notification
            key={n.id}
            title={n.title}
            body={n.body}
            type={n.type.toLowerCase() as 'system' | 'wallet' | 'game' | 'security'}
            unread={n.status === 'UNREAD'}
            timestamp={new Date(n.createdAt).toLocaleString()}
          />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useRadar } from './services/store';
import { bridge, isNative } from './lib/env';
import { initTray } from './services/tray';
import { endOfDay, SNOOZE_LATER_MS } from './services/nudge';
import type { Tab } from './types';
import { Popup } from './features/Popup';

export function App() {
  const [ready, setReady] = useState(useRadar.persist.hasHydrated());

  useEffect(() => {
    if (useRadar.persist.hasHydrated()) return setReady(true);
    return useRadar.persist.onFinishHydration(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.body.classList.add(isNative() ? 'native' : 'demo');
    void useRadar.getState().boot();
    if (!isNative()) return;
    initTray();
    const offOpen = bridge()!.on('toast-open', ({ keys }: { keys: string[] }) => {
      const s = useRadar.getState();
      const items = [...s.snap.issues, ...s.snap.mrs, ...s.snap.pipes, ...s.snap.todos].filter((i) => keys.includes(i.key));
      s.markRead(items.map((i) => ({ key: i.key, updatedAt: i.updatedAt })));
    });
    const offAction = bridge()!.on('toast-action', ({ action, tab }: { action: 'view' | 'later' | 'stop'; tab: Tab }) => {
      const s = useRadar.getState();
      if (action === 'view') {
        s.setView('main');
        s.setTab(tab);
        s.markOpened();
      } else s.snoozeNudge(action === 'later' ? SNOOZE_LATER_MS : endOfDay(Date.now()) - Date.now());
    });
    const onVisible = () => document.visibilityState === 'visible' && useRadar.getState().markOpened();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offOpen();
      offAction();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready]);

  return ready ? <Popup /> : null;
}

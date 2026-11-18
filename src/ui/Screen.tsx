import { IonContent, IonPage } from '@ionic/react';
import type { ReactNode } from 'react';

interface ScreenProps {
  title: string;
  kicker?: string;
  lede?: string;
  children: ReactNode;
}

/** Page shell: Ionic handles scrolling and safe areas, everything visible is Lantern's. */
export function Screen(props: ScreenProps) {
  return (
    <IonPage>
      <IonContent>
        <ScreenBody {...props} />
      </IonContent>
    </IonPage>
  );
}

/**
 * The screen without its Ionic page, for a route that switches between scenes inside
 * one page. Swapping one `IonPage` for another without navigating leaves the new one
 * hidden on Android (Ionic only reveals a page during a route transition).
 */
export function ScreenBody({ title, kicker, lede, children }: ScreenProps) {
  return (
    <main className="ln-screen">
      <header className="ln-screen__head">
        {kicker && <span className="ln-kicker">{kicker}</span>}
        <h1>{title}</h1>
        {lede && <p className="ln-screen__lede">{lede}</p>}
      </header>
      {children}
    </main>
  );
}

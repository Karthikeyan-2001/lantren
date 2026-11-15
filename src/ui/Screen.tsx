import { IonContent, IonPage } from '@ionic/react';
import type { ReactNode } from 'react';

interface ScreenProps {
  title: string;
  kicker?: string;
  lede?: string;
  children: ReactNode;
}

/** Page shell: Ionic handles scrolling and safe areas, everything visible is Lantern's. */
export function Screen({ title, kicker, lede, children }: ScreenProps) {
  return (
    <IonPage>
      <IonContent>
        <main className="ln-screen">
          <header className="ln-screen__head">
            {kicker && <span className="ln-kicker">{kicker}</span>}
            <h1>{title}</h1>
            {lede && <p className="ln-screen__lede">{lede}</p>}
          </header>
          {children}
        </main>
      </IonContent>
    </IonPage>
  );
}

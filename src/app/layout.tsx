import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'NexusBridge · Inteligências em conversa',description:'Conecte pessoas, modelos e memórias com controle.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>;}

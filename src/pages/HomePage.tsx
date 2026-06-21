import { EditorHeader } from '@/components/TopBar'
import { WelcomeScreen } from '@/components/WelcomeScreen'

export function HomePage() {
  return (
    <div className="editor-shell">
      <EditorHeader />
      <WelcomeScreen />
    </div>
  )
}

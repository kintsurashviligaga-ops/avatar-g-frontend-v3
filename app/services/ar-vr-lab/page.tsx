import { ServiceShell } from "@/components/shared/ServiceShell"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <ServiceShell
      title="Ar-vr-lab"
      subtitle="Premium AI-powered service with full functionality"
      gradient="from-cyan-400 to-blue-500"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card className="p-8 min-h-[500px] flex items-center justify-center" glow>
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-4">Ar-vr-lab Workspace</h2>
              <p className="text-gray-400 mb-6">Full-featured interface loading...</p>
              <Button variant="glow">Get Started</Button>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Tools</h3>
            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start">Tool 1</Button>
              <Button variant="outline" className="w-full justify-start">Tool 2</Button>
              <Button variant="outline" className="w-full justify-start">Tool 3</Button>
            </div>
          </Card>
        </div>
      </div>
    </ServiceShell>
  )
}

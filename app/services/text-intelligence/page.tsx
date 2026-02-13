'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  Languages,
  Search,
  BarChart3,
  Sparkles,
  Copy,
  Download,
  Loader2
} from 'lucide-react'

type FeatureType = 'summarize' | 'translate' | 'seo' | 'sentiment'

interface AnalysisResult {
  type: FeatureType
  result: string
  metrics?: Record<string, any>
}

export default function TextIntelligencePage() {
  const t = useTranslations('services')
  const [inputText, setInputText] = useState('')
  const [activeFeature, setActiveFeature] = useState<FeatureType>('summarize')
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const features = [
    {
      id: 'summarize' as FeatureType,
      icon: FileText,
      label: 'რეზიუმე',
      description: 'ტექსტის შეჯამება და მთავარი იდეების გამოყოფა'
    },
    {
      id: 'translate' as FeatureType,
      icon: Languages,
      label: 'თარგმანი',
      description: 'მრავალენოვანი თარგმანი AI-ით'
    },
    {
      id: 'seo' as FeatureType,
      icon: Search,
      label: 'SEO ოპტიმიზაცია',
      description: 'საძიებო სისტემებისთვის ადაპტაცია'
    },
    {
      id: 'sentiment' as FeatureType,
      icon: BarChart3,
      label: 'სენტიმენტ ანალიზი',
      description: 'ტექსტის ემოციური ტონის ანალიზი'
    }
  ]

  const handleAnalyze = async () => {
    if (!inputText.trim()) return

    setIsProcessing(true)
    
    try {
      // TODO: Connect to actual API endpoint
      // const response = await fetch('/api/text/analyze', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     text: inputText,
      //     feature: activeFeature
      //   })
      // })
      // const data = await response.json()

      // Mock result for Beta phase
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const mockResults: Record<FeatureType, AnalysisResult> = {
        summarize: {
          type: 'summarize',
          result: 'ეს არის ტექსტის შეჯამებული ვერსია, რომელიც შეიცავს მთავარ იდეებს და ძირითად ინფორმაციას. AI-მ გამოყო ყველაზე მნიშვნელოვანი წინადადებები და შექმნა კონსპექტური ტექსტი.',
          metrics: {
            originalLength: inputText.length,
            summaryLength: 180,
            compressionRatio: '65%'
          }
        },
        translate: {
          type: 'translate',
          result: 'This is the translated version of your text, processed by advanced AI translation models for natural and contextually accurate results.',
          metrics: {
            sourceLanguage: 'Georgian',
            targetLanguage: 'English',
            confidence: '96%'
          }
        },
        seo: {
          type: 'seo',
          result: 'შესაბამისი SEO ოპტიმიზირებული ტექსტი კონტენტის უკეთესი რანჟირებისთვის საძიებო სისტემებში. დამატებული სათანადო საკვანძო სიტყვები, სტრუქტურირებული ფორმატი და აღწერითი meta tags.',
          metrics: {
            keywords: ['AI', 'ოპტიმიზაცია', 'SEO', 'კონტენტი'],
            readabilityScore: '89/100',
            seoScore: '92/100'
          }
        },
        sentiment: {
          type: 'sentiment',
          result: 'ტექსტის საერთო ტონი: დადებითი (78%). ანალიზი აჩვენებს ოპტიმისტურ და მეგობრულ ენას კომუნიკაციის დასამყარებლად.',
          metrics: {
            positive: '78%',
            neutral: '15%',
            negative: '7%',
            confidence: '94%'
          }
        }
      }

      setResult(mockResults[activeFeature])
    } catch (error) {
      console.error('Analysis error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result.result)
    }
  }

  const handleDownload = () => {
    if (result) {
      const blob = new Blob([result.result], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `text-intelligence-${result.type}-${Date.now()}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="container mx-auto px-4 py-24 max-w-6xl">
      {/* Header */}
      <div className="text-center mb-12 space-y-4">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
            <FileText className="w-8 h-8" />
          </div>
          <Badge variant="secondary" className="text-sm">Beta</Badge>
        </div>
        
        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 bg-clip-text text-transparent">
          {t('text_intelligence')}
        </h1>
        
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          ტექსტის ანალიზი, რეზიუმე, თარგმანი და SEO ოპტიმიზაცია AI-ით
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {features.map((feature) => {
          const Icon = feature.icon
          const isActive = activeFeature === feature.id

          return (
            <Card
              key={feature.id}
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg ${
                isActive ? 'ring-2 ring-purple-500 shadow-lg' : ''
              }`}
              onClick={() => setActiveFeature(feature.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    isActive 
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white' 
                      : 'bg-secondary'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-base">{feature.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              შეიყვანე ტექსტი
            </CardTitle>
            <CardDescription>
              ჩაწერე ან ჩასვი ტექსტი ანალიზისთვის
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="ჩაწერე ან ჩასვი შენი ტექსტი აქ..."
              value={inputText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputText(e.target.value)}
              className="min-h-[300px] resize-none"
            />
            
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{inputText.length} სიმბოლო</span>
              <span>
                {inputText.split(/\s+/).filter(w => w.length > 0).length} სიტყვა
              </span>
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={!inputText.trim() || isProcessing}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ანალიზი მიმდინარეობს...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  ანალიზის დაწყება
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Result Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                შედეგი
              </CardTitle>
              
              {result && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <CardDescription>
              AI-ით დამუშავებული ტექსტი
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center text-muted-foreground">
                <FileText className="w-16 h-16 mb-4 opacity-20" />
                <p>აირჩიე ფუნქცია და დაიწყე ანალიზი</p>
              </div>
            ) : (
              <>
                <div className="p-4 bg-secondary/50 rounded-lg min-h-[200px]">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {result.result}
                  </p>
                </div>

                {result.metrics && (
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(result.metrics).map(([key, value]) => (
                      <div
                        key={key}
                        className="p-3 bg-secondary/30 rounded-lg text-center"
                      >
                        <p className="text-xs text-muted-foreground capitalize mb-1">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        <p className="font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Beta Notice */}
      <Card className="mt-8 border-yellow-500/50 bg-yellow-500/5">
        <CardContent className="flex items-start gap-3 pt-6">
          <Sparkles className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-yellow-600 dark:text-yellow-500">
              Beta ვერსია
            </p>
            <p className="text-sm text-muted-foreground">
              ეს სერვისი Beta ფაზაშია. ზოგიერთი ფუნქცია შეიძლება იყოს შეზღუდული ან 
              მოითხოვოს დამატებითი დაყენება. სრული ანალიტიკა და API ინტეგრაცია მალე ხელმისაწვდომი იქნება.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

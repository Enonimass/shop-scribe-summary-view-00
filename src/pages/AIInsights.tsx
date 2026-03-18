import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, BrainCircuit, Loader2, Sparkles, BarChart3, AlertTriangle, Users, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const AIInsights = () => {
  const { profile, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [insight, setInsight] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [shopFilter, setShopFilter] = useState<string>('all');

  if (authLoading) return null;
  if (!isAuthenticated) {
    navigate('/auth');
    return null;
  }

  const shopId = profile?.role === 'seller' ? profile.shop_id : (shopFilter !== 'all' ? shopFilter : undefined);

  const generateReport = async () => {
    setLoading(true);
    setInsight(null);
    setMeta(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-insights', {
        body: { shop_id: shopId || null },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate report');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setInsight(data.insight);
      setMeta(data.meta);

      toast({
        title: "Report generated",
        description: `Analyzed ${data.meta?.transactions_analyzed || 0} transactions`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to generate report",
        description: err.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BrainCircuit className="h-7 w-7 text-primary" />
              AI Insights
            </h1>
            <p className="text-muted-foreground text-sm">
              AI-powered analysis of your sales &amp; inventory data
            </p>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Monthly Report
            </CardTitle>
            <CardDescription>
              Analyze the last 30 days of sales data for growth trends, inventory warnings, and actionable insights.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile?.role === 'admin' && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-foreground">Shop:</label>
                <Select value={shopFilter} onValueChange={setShopFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Shops</SelectItem>
                    <SelectItem value="shop1">Shop 1</SelectItem>
                    <SelectItem value="shop2">Shop 2</SelectItem>
                    <SelectItem value="shop3">Shop 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              onClick={generateReport}
              disabled={loading}
              size="lg"
              className="w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyzing data...
                </>
              ) : (
                <>
                  <BrainCircuit className="mr-2 h-5 w-5" />
                  Generate Monthly Report
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <Sparkles className="h-5 w-5 text-primary absolute -top-1 -right-1 animate-pulse" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">AI is analyzing your data...</p>
                <p className="text-sm text-muted-foreground">This may take a few seconds</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Insight Result */}
        {insight && !loading && (
          <div className="space-y-4">
            {/* Meta info */}
            {meta && (
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span>{meta.transactions_analyzed} transactions</span>
                </div>
                <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm">
                  <span>📅 {meta.date_range}</span>
                </div>
                <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full text-sm">
                  <span>🏪 {meta.shop_id === 'all' ? 'All Shops' : meta.shop_id}</span>
                </div>
              </div>
            )}

            {/* Insight Card */}
            <Card className="border-primary/30 shadow-lg">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Analysis Report
                </CardTitle>
                <CardDescription>
                  Generated on {new Date().toLocaleDateString('en-US', { 
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="prose prose-sm max-w-none dark:prose-invert
                  prose-headings:text-foreground prose-p:text-foreground/80
                  prose-strong:text-foreground prose-li:text-foreground/80
                  prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3
                  prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                  prose-ul:my-2 prose-ol:my-2">
                  <ReactMarkdown>{insight}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Empty state */}
        {!insight && !loading && (
          <Card className="border-dashed">
            <CardContent className="py-16 flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex gap-3">
                <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
                <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <Lightbulb className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-medium text-muted-foreground">No report generated yet</p>
                <p className="text-sm text-muted-foreground/70">
                  Click "Generate Monthly Report" to get AI-powered insights on your business data.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AIInsights;

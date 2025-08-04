import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { getRandomVerse } from "@/data/verses";
import { Heart, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
export default function VozDeDeus() {
  const [name, setName] = useState("");
  const [currentMessage, setCurrentMessage] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const {
    toast
  } = useToast();
  const handleReceiveWord = () => {
    if (!name.trim()) {
      toast({
        title: "Digite seu nome",
        description: "Por favor, digite seu nome para receber a palavra de Deus.",
        variant: "destructive"
      });
      return;
    }
    const verse = getRandomVerse();
    const message = `${name}, hoje a Palavra de Deus para você é:\n\n"${verse}"\n\nJesus te ama e está contigo!`;
    setCurrentMessage(message);
    setShowMessage(true);
  };
  const handleNewWord = () => {
    setShowMessage(false);
    setCurrentMessage("");
  };
  return <div className="min-h-screen bg-gradient-heavenly flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="w-8 h-8 text-primary animate-divine-glow" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-divine bg-clip-text text-transparent">
              Voz de Deus
            </h1>
            <Heart className="w-8 h-8 text-secondary animate-blessing-pulse" />
          </div>
          <p className="text-muted-foreground text-lg">
            Receba uma palavra especial do Senhor para você hoje
          </p>
        </div>

        {!showMessage ? (/* Input Form */
      <Card className="shadow-divine border-0 bg-card/80 backdrop-blur-sm">
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-lg font-medium text-foreground">
                    Digite seu nome:
                  </label>
                  <Input id="name" type="text" placeholder="Seu nome aqui..." value={name} onChange={e => setName(e.target.value)} className="text-lg h-12 border-primary/20 focus:border-primary transition-colors" onKeyPress={e => e.key === "Enter" && handleReceiveWord()} />
                </div>
                
                <Button onClick={handleReceiveWord} className="w-full h-14 text-lg font-semibold bg-gradient-divine hover:shadow-blessing transition-all duration-300 transform hover:scale-105" disabled={!name.trim()}>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Receber Palavra
                </Button>
              </div>
            </CardContent>
          </Card>) : (/* Message Display */
      <Card className="shadow-divine border-0 bg-card/90 backdrop-blur-sm animate-fade-in-up">
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="text-center">
                  <div className="bg-gradient-blessing p-6 rounded-xl shadow-blessing">
                    <pre className="text-foreground text-lg leading-relaxed whitespace-pre-wrap font-sans">
                      {currentMessage}
                    </pre>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button onClick={handleNewWord} className="w-full max-w-xs h-12 text-base font-medium bg-gradient-divine hover:shadow-blessing transition-all duration-300">
                    <Sparkles className="w-4 h-4 mr-2" />
                    Nova Palavra
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>)}

        {/* Footer */}
        <div className="text-center mt-8 text-muted-foreground">
          <p className="text-sm">"A palavra de Deus é viva e eficaz" - Hebreus 4:12. Feito por Kaian Bruno.</p>
        </div>
      </div>
    </div>;
}
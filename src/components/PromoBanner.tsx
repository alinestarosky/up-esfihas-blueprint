import { useBannerAtivo } from '@/hooks/useBannerPromocional';
import { useProdutos } from '@/hooks/useProdutos';
import { useCart } from '@/contexts/CartContext';
import { toast } from 'sonner';
import { useState } from 'react';

export const PromoBanner = () => {
  const banner = useBannerAtivo();
  const { data: produtos } = useProdutos(false);
  const { addToCart } = useCart();
  const [isPressed, setIsPressed] = useState(false);

  if (!banner?.imagem_url) return null;

  const produto = banner.produto_id ? produtos?.find((p) => p.id === banner.produto_id) : undefined;
  // Banner com produto vinculado só aparece quando o produto está disponível.
  if (banner.produto_id && !produto) return null;

  const image = (
    <img
      src={banner.imagem_url}
      alt={banner.titulo || 'Promoção'}
      loading="lazy"
      className="w-full h-auto object-cover"
    />
  );

  // key = id: ao trocar de banner pela agenda, o novo entra com fade suave.
  if (!produto) {
    return (
      <div key={banner.id} className="container mx-auto px-2 sm:px-4 pt-3 animate-in fade-in duration-300">
        <div className="relative w-full overflow-hidden rounded-xl shadow-md">{image}</div>
      </div>
    );
  }

  const precoFinal = banner.valor_promocional ?? produto.preco;

  const handleClick = () => {
    addToCart({ ...produto, preco: precoFinal });
    setIsPressed(true);
    toast.success(`${produto.nome} adicionado ao carrinho!`);
    setTimeout(() => setIsPressed(false), 300);
  };

  return (
    <div key={banner.id} className="container mx-auto px-2 sm:px-4 pt-3 animate-in fade-in duration-300">
      <button
        onClick={handleClick}
        className={`relative w-full overflow-hidden rounded-xl shadow-md transition-all duration-200 hover:shadow-xl active:scale-[0.98] ${isPressed ? 'scale-[0.97]' : ''}`}
      >
        {image}
      </button>
    </div>
  );
};

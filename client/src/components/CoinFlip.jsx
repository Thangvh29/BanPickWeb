import React, { useState, useEffect } from 'react';
import '../index.css';

const CoinFlip = ({ isVisible, result, onClose }) => {
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsFlipping(true);
      const timer = setTimeout(() => {
        setIsFlipping(false);
        // onClose(); // Đóng modal sau khi xoay xong (tùy yêu cầu)
      }, 1500); // Đồng bộ với animation 1.5s
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  return (
    isVisible && (
      <div className="coin-flip-modal">
        <div className="coin-flip-content">
          <div className={`coin ${isFlipping ? 'flip' : ''}`}>
            <img
              src={result === 'heads' ? '/heads.png' : '/tails.png'}
              alt="Coin"
            />
          </div>
          <p>{isFlipping ? 'Đang tung đồng xu...' : `Kết quả: ${result === 'heads' ? 'Sấp' : 'Ngửa'}`}</p>
        </div>
      </div>
    )
  );
};

export default CoinFlip;
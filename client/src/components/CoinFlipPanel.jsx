import React from 'react';

const CoinFlipPanel = ({ started, flipResult }) => {
  if (!started) return null;
  return (
    <div className="text-center mt-3">
      {flipResult ? (
        <h4>{flipResult}</h4>
      ) : (
        <p>Chưa tung đồng xu</p>
      )}
    </div>
  );
};

export default CoinFlipPanel;
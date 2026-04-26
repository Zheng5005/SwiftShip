export default () => ({
  orderExpiryMs: parseInt(process.env.ORDER_EXPIRY_MS || '600000', 10),
});

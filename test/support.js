const setupGlobals = async () => {
  const chai = await import('chai');
  const chaiAsPromised = await import('chai-as-promised');
  const sinonChai = await import('sinon-chai');

  chai.default.config.includeStack = true;
  chai.default.use(chaiAsPromised.default);
  chai.default.use(sinonChai.default);

  global.expect = chai.default.expect;
};

exports.mochaGlobalSetup = async function () {
  await setupGlobals();
};

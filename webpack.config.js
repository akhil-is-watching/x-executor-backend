/**
 * Nest merges this with its default webpack config.
 * Skips ForkTsCheckerWebpackPlugin so CI/Railway builds stay fast and do not hang on low memory.
 * Run `yarn test` / `yarn lint` for type-checking instead.
 */
module.exports = function (options) {
  const rules = options.module?.rules?.map((rule) => {
    if (!rule?.test?.test?.('.ts')) {
      return rule;
    }
    return {
      ...rule,
      use: rule.use.map((use) => {
        if (typeof use === 'object' && use?.loader === 'ts-loader') {
          return {
            ...use,
            options: { ...use.options, transpileOnly: true },
          };
        }
        return use;
      }),
    };
  });

  const plugins = (options.plugins ?? []).filter(
    (plugin) => plugin?.constructor?.name !== 'ForkTsCheckerWebpackPlugin',
  );

  return {
    ...options,
    module: { ...options.module, rules },
    plugins,
  };
};

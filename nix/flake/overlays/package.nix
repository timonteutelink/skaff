localFlake:
{ lib, config, self, inputs, ... }: {
  flake.overlays.default = final: prev: {
    timon-code-templator-cli = config.flake.packages.${prev.stdenv.hostPlatform.system}.code-templator-cli;
  };
}


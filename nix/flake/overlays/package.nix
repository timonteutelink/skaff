localFlake:
{ lib, config, self, inputs, ... }: {
  flake.overlays.default = final: prev: {
    code-templator-cli = config.flake.packages.${prev.stdenv.hostPlatform.system}.code-templator-cli;
  };
}


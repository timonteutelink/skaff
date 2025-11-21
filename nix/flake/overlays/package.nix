localFlake:
{ lib, config, self, inputs, ... }: {
  flake.overlays.default = final: prev: {
    skaff-cli = config.flake.packages.${prev.stdenv.hostPlatform.system}.skaff-cli;
    skaff-web = config.flake.packages.${prev.stdenv.hostPlatform.system}.skaff-web;
  };
}


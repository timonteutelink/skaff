localFlake:
{ lib, config, self, inputs, ... }: {
  flake.overlays.default = final: prev: {
    timon-skaff-cli = config.flake.packages.${prev.stdenv.hostPlatform.system}.skaff-cli;
  };
}


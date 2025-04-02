localFlake:
{ lib, config, self, inputs, ... }: {
  flake.overlays.default = final: prev: {
    timon-nix-software-panel = config.flake.packages.${prev.stdenv.hostPlatform.system}.nix-software-panel-server;
  };
}


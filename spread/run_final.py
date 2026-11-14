"""Runs the bot on the final (or a test final) and restarts it on any crash. Ctrl-C to stop; the world keeps running."""
import sys, time, traceback
import dispatch_asif as dispatch
from spread.client import Client, SpreadError, Unreachable

def main():
    client = Client()
    world = None
    while True:
        try:
            if world is None:
                world = dispatch.next_final(client)
                print(f"final world {world.id}", flush=True)
            dispatch.play_final(world)
            print("final over:", world.score(), flush=True)
            return
        except Unreachable as e:
            print("unreachable:", e, flush=True); time.sleep(3)
        except SpreadError as e:
            print("spread error:", e, flush=True); time.sleep(3)
        except KeyboardInterrupt:
            raise
        except Exception:
            traceback.print_exc(); time.sleep(2)

if __name__ == "__main__":
    main()
